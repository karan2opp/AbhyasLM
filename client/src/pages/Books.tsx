import { useState } from "react"
import { Link } from "react-router"
import { BookOpen, FileUp, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { bookStatusText, isBookWorking } from "@/components/BookPicker"
import { StatusBadge } from "@/components/StatusBadge"
import { PageHeader } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useResource } from "@/lib/hooks"
import { useRole } from "@/lib/session"
import type { BookSummary } from "@/lib/types"

const cardClass = "bg-[#0f0f11] border border-white/10 ring-0"
const inputClass = "bg-[#14151f] border border-white/15 text-white placeholder:text-zinc-500 h-9 text-sm rounded-lg"

function BookRow({ book, onChanged }: { book: BookSummary; onChanged: () => void }) {
  const api = useApi()
  const role = useRole()
  const [isDeleting, setIsDeleting] = useState(false)
  const pct = book.progress?.stage === "indexing" && book.progress.windowsTotal > 0 ? Math.round((book.progress.windowsDone / book.progress.windowsTotal) * 100) : null

  const handleDelete = async () => {
    if (!confirm(`Delete "${book.title}"?`)) return
    setIsDeleting(true)
    try {
      await api(`/api/books/${book.id}`, { method: "DELETE" })
      toast.success("Book deleted")
      onChanged()
    } catch (err) {
      toast.error((err as Error).message || "Delete failed")
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0b0b0d] p-3 text-sm">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-9 w-9 bg-orange-600/20 text-orange-400 rounded-lg flex items-center justify-center border border-orange-500/30 shrink-0">
          <BookOpen className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          {book.status === "completed" ? (
            <Link to={`/books/${book.id}`} className="block truncate font-medium text-white hover:text-orange-300">
              {book.title}
            </Link>
          ) : (
            <span className="block truncate font-medium text-white">{book.title}</span>
          )}
          {book.status === "failed" ? (
            <span className="text-xs text-red-400">{book.error}</span>
          ) : (
            <span className="text-xs text-gray-500">{bookStatusText(book)}</span>
          )}
          {pct !== null && (
            <div className="mt-1.5 w-full max-w-xs bg-[#14151f] border border-white/10 rounded-full h-1.5 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Indexing progress">
              <div className="h-full bg-gradient-to-r from-orange-600 to-amber-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          )}
          {role === "admin" && book.ownerEmail && <span className="block text-[11px] text-gray-500">Uploaded by {book.ownerEmail}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={book.status} label={isBookWorking(book) ? "Indexing" : undefined} />
        {book.status === "completed" && (
          <Link to={`/books/${book.id}`} className="text-xs font-semibold text-orange-400 hover:text-orange-300 px-2">
            Browse
          </Link>
        )}
        <Button variant="ghost" size="icon-sm" onClick={() => void handleDelete()} disabled={isDeleting} aria-label={`Delete ${book.title}`} title="Delete book">
          {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5 text-red-400" />}
        </Button>
      </div>
    </div>
  )
}

export default function Books() {
  const api = useApi()
  const books = useResource<BookSummary[]>("/api/books", (list) => (list.some(isBookWorking) ? 4000 : null))
  const list = books.data ?? []

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [isUploading, setIsUploading] = useState(false)

  const handleUpload = async () => {
    if (!file) {
      toast.error("Choose a PDF file first")
      return
    }
    setIsUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      if (title.trim()) body.append("title", title.trim())
      await api("/api/books", { method: "POST", body })
      toast.success("Book uploaded. Indexing has started and can take a few minutes for a long book.")
      setFile(null)
      setTitle("")
      await books.reload()
    } catch (err) {
      toast.error((err as Error).message || "Upload failed")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader title="Books" description="Upload a textbook to index its chapters. Pick it in the From Source mode and questions are written from the matching sections." />

        <Card className={cardClass}>
          <CardHeader>
            <CardTitle className="text-white">Upload a book</CardTitle>
            <CardDescription className="text-gray-400">PDFs with selectable text only, up to 150 MB. Scanned books aren&apos;t supported yet.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-gray-300 hover:bg-white/5 focus-within:ring-2 focus-within:ring-orange-500/50">
              <FileUp className="size-4 text-orange-400" />
              <span className="max-w-60 truncate">{file ? file.name : "Choose a PDF file"}</span>
              <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <Input placeholder="Book title (optional)" aria-label="Book title" value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputClass} max-w-72`} />
            <Button onClick={() => void handleUpload()} disabled={isUploading || !file} className="bg-orange-600 hover:bg-orange-700 text-white h-9 px-4 font-semibold">
              {isUploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Uploading...
                </>
              ) : (
                "Upload and index"
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-white">Library</CardTitle>
              <CardDescription className="text-gray-400">Open an indexed book to browse the contents questions are written from.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void books.reload()} className="bg-transparent border-white/15 text-gray-300 hover:text-white">
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {books.loading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="size-3.5 animate-spin" /> Loading books...
              </div>
            ) : list.length === 0 ? (
              <div className="text-xs italic text-gray-500">No books uploaded yet</div>
            ) : (
              <div className="flex flex-col gap-2">
                {list.map((book) => (
                  <BookRow key={book.id} book={book} onChanged={() => void books.reload()} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
