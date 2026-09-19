import { useState } from "react"
import { Check, FileUp, Loader2, Pencil, RefreshCw, Search, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/StatusBadge"
import { PageHeader } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useResource } from "@/lib/hooks"
import { useRole } from "@/lib/session"
import type { PaperDocument, QuestionBankSearchResult } from "@/lib/types"

const cardClass = "bg-[#0f0f11] border border-white/10 ring-0"
const inputClass = "bg-[#14151f] border border-white/15 text-white placeholder:text-zinc-500 h-9 text-sm rounded-lg"

function ResultCard({ result, documentTitle }: { result: QuestionBankSearchResult; documentTitle?: string }) {
  const { chunk, score } = result
  return (
    <Card className={cardClass}>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2">
        <CardTitle className="text-white">{chunk.questionNumber ? `Q${chunk.questionNumber}` : "Question"}</CardTitle>
        <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400 ring-1 ring-orange-500/30">match {Math.round(score * 100)}%</span>
        {chunk.subject && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-amber-500/30">{chunk.subject}</span>}
        {(chunk.topics || []).map((t) => (
          <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-gray-300 ring-1 ring-white/10">
            {t}
          </span>
        ))}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {chunk.description && <p className="text-xs italic text-gray-400">{chunk.description}</p>}
        <pre className="max-h-48 overflow-auto custom-scrollbar rounded-md bg-[#14151f] border border-white/5 p-3 text-xs text-gray-200 whitespace-pre-wrap font-sans">{chunk.rawText}</pre>
        {chunk.images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chunk.images.map((img, i) => (
              <img key={i} src={img.url} alt={`Figure ${i + 1} for question ${chunk.questionNumber ?? ""}`} className="max-h-28 max-w-36 rounded-md border border-white/10 object-contain bg-white" />
            ))}
          </div>
        )}
        {chunk.tables.map((table, i) => (
          <div key={i} className="overflow-auto rounded-md border border-white/10">
            <table className="w-full border-collapse text-xs text-gray-200">
              {table.header && (
                <thead>
                  <tr className="bg-white/5">
                    {table.header.map((h, hi) => (
                      <th key={hi} className="border border-white/10 px-2 py-1 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {table.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-white/10 px-2 py-1">
                        {cell ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div className="text-[11px] text-gray-500">
          {documentTitle ? `${documentTitle} · ` : ""}pages {chunk.pageStart}–{chunk.pageEnd}
        </div>
      </CardContent>
    </Card>
  )
}

function DocumentRow({ doc, onChanged }: { doc: PaperDocument; onChanged: () => void }) {
  const api = useApi()
  const role = useRole()
  const [isEditing, setIsEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(doc.title)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const saveTitle = async () => {
    const title = titleDraft.trim()
    if (!title || title === doc.title) {
      setIsEditing(false)
      setTitleDraft(doc.title)
      return
    }
    setIsSaving(true)
    try {
      await api(`/api/question-bank/documents/${doc.id}`, { method: "PATCH", body: JSON.stringify({ title }) })
      setIsEditing(false)
      onChanged()
    } catch (err) {
      toast.error((err as Error).message || "Rename failed")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${doc.title}"? This removes all its extracted questions too.`)) return
    setIsDeleting(true)
    try {
      await api(`/api/question-bank/documents/${doc.id}`, { method: "DELETE" })
      toast.success("Paper deleted")
      onChanged()
    } catch (err) {
      toast.error((err as Error).message || "Delete failed")
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0b0b0d] p-3 text-sm">
      <div className="flex min-w-0 flex-1 flex-col">
        {isEditing ? (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              value={titleDraft}
              aria-label="Paper title"
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveTitle()
                if (e.key === "Escape") {
                  setIsEditing(false)
                  setTitleDraft(doc.title)
                }
              }}
              className={`${inputClass} h-8 max-w-72`}
            />
            <Button variant="ghost" size="icon-sm" onClick={() => void saveTitle()} disabled={isSaving} aria-label="Save title">
              {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Cancel rename"
              onClick={() => {
                setIsEditing(false)
                setTitleDraft(doc.title)
              }}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate font-medium text-white">{doc.title}</span>
            <button title="Rename" aria-label={`Rename ${doc.title}`} onClick={() => setIsEditing(true)} className="text-gray-500 hover:text-white">
              <Pencil className="size-3.5" />
            </button>
          </div>
        )}
        {doc.status === "failed" && doc.error && <span className="text-xs text-red-400">{doc.error}</span>}
        {role === "admin" && doc.ownerEmail && <span className="text-[11px] text-gray-500">Uploaded by {doc.ownerEmail}</span>}
      </div>
      <div className="flex items-center gap-2">
        {doc.status === "completed" && <span className="text-xs text-gray-400">{doc.totalChunks} question(s)</span>}
        <StatusBadge status={doc.status} />
        <Button variant="ghost" size="icon-sm" onClick={() => void handleDelete()} disabled={isDeleting} aria-label={`Delete ${doc.title}`} title="Delete paper">
          {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5 text-red-400" />}
        </Button>
      </div>
    </div>
  )
}

export default function QuestionBank() {
  const api = useApi()
  const docs = useResource<PaperDocument[]>("/api/question-bank/documents", (list) => (list.some((d) => d.status === "pending" || d.status === "processing") ? 4000 : null))
  const documents = docs.data ?? []

  const [file, setFile] = useState<File | null>(null)
  const [docName, setDocName] = useState("")
  const [isUploading, setIsUploading] = useState(false)

  const [query, setQuery] = useState("")
  const [subject, setSubject] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<QuestionBankSearchResult[] | null>(null)

  const handleUpload = async () => {
    if (!file) {
      toast.error("Choose a PDF file first")
      return
    }
    setIsUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      if (docName.trim()) body.append("title", docName.trim())
      await api("/api/question-bank/documents", { method: "POST", body })
      toast.success("Upload started — processing in the background")
      setFile(null)
      setDocName("")
      await docs.reload()
    } catch (err) {
      toast.error((err as Error).message || "Upload failed")
    } finally {
      setIsUploading(false)
    }
  }

  const handleSearch = async () => {
    if (!query.trim()) {
      toast.error("Enter a search query")
      return
    }
    setIsSearching(true)
    setResults(null)
    try {
      const data = await api<QuestionBankSearchResult[]>("/api/question-bank/search", {
        method: "POST",
        body: JSON.stringify({ query: query.trim(), ...(subject.trim() && { subject: subject.trim() }) }),
      })
      setResults(data)
      if (data.length === 0) toast.message("No matching questions found")
    } catch (err) {
      toast.error((err as Error).message || "Search failed")
    } finally {
      setIsSearching(false)
    }
  }

  const titles = Object.fromEntries(documents.map((d) => [d.id, d.title]))

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          title="Question Bank"
          description="Upload previous-year question papers. Each one is split into questions with their options and answer key, so you can search them or pull them into an exam."
        />

        <Card className={cardClass}>
          <CardHeader>
            <CardTitle className="text-white">Upload a paper</CardTitle>
            <CardDescription className="text-gray-400">Each upload is read, split into questions, classified by topic, and made searchable in the background.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-gray-300 hover:bg-white/5 focus-within:ring-2 focus-within:ring-orange-500/50">
              <FileUp className="size-4 text-orange-400" />
              <span className="max-w-60 truncate">{file ? file.name : "Choose a PDF file"}</span>
              <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <Input placeholder="Paper name (optional, defaults to filename)" aria-label="Paper name" value={docName} onChange={(e) => setDocName(e.target.value)} className={`${inputClass} max-w-72`} />
            <Button onClick={() => void handleUpload()} disabled={isUploading || !file} className="bg-orange-600 hover:bg-orange-700 text-white h-9 px-4 font-semibold">
              {isUploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Uploading...
                </>
              ) : (
                "Upload & Process"
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-white">Papers</CardTitle>
              <CardDescription className="text-gray-400">Your uploads and their processing status.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void docs.reload()} className="bg-transparent border-white/15 text-gray-300 hover:text-white">
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {docs.loading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="size-3.5 animate-spin" /> Loading papers...
              </div>
            ) : documents.length === 0 ? (
              <div className="text-xs italic text-gray-500">No papers uploaded yet</div>
            ) : (
              <div className="flex flex-col gap-2">
                {documents.map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} onChanged={() => void docs.reload()} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardHeader>
            <CardTitle className="text-white">Search</CardTitle>
            <CardDescription className="text-gray-400">Find questions by meaning across every processed paper.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void handleSearch()
              }}
            >
              <Input placeholder="e.g. projectile motion maximum height" aria-label="Search query" value={query} onChange={(e) => setQuery(e.target.value)} className={`${inputClass} min-w-64 flex-1`} />
              <Input placeholder="Subject filter (optional)" aria-label="Subject filter" value={subject} onChange={(e) => setSubject(e.target.value)} className={`${inputClass} w-48`} />
              <Button type="submit" disabled={isSearching} className="bg-orange-600 hover:bg-orange-700 text-white h-9 px-4 font-semibold">
                {isSearching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Search
              </Button>
            </form>
          </CardContent>
        </Card>

        {results && (
          <div className="flex flex-col gap-4" aria-live="polite">
            {results.map((r) => (
              <ResultCard key={r.chunk.id} result={r} documentTitle={titles[r.chunk.documentId]} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
