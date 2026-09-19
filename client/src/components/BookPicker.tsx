import { BookOpen, Loader2 } from "lucide-react"
import type { BookProgress, BookSummary } from "@/lib/types"
import { cn } from "@/lib/utils"
import { LoadingRow } from "./workspace"

const STAGE_LABEL: Record<BookProgress["stage"], string> = {
  extracting: "Reading pages",
  indexing: "Building index",
  merging: "Joining sections",
  saving: "Saving",
}

export const isBookWorking = (b: BookSummary) => b.status === "pending" || b.status === "processing"

export function bookStatusText(book: BookSummary): string {
  if (book.status === "completed") return book.pageCount ? `${book.pageCount} pages` : "Ready"
  if (book.status === "failed") return "Failed"
  const progress = book.progress
  if (!progress) return "Waiting to start"
  if (progress.stage === "indexing" && progress.windowsTotal > 0) {
    return `${STAGE_LABEL.indexing} ${Math.round((progress.windowsDone / progress.windowsTotal) * 100)}%`
  }
  return STAGE_LABEL[progress.stage] ?? "Processing"
}

/** The "Choose a book" radio list from Abhyas's From Source flow. */
export function BookPicker({ books, loading, selectedId, onSelect }: { books: BookSummary[]; loading: boolean; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Choose a book</h2>
        <p className="text-xs text-gray-400 mt-0.5">Questions will be planned from this book&apos;s chapters and written from its text. Upload a new one from the panel on the right.</p>
      </div>
      {loading ? (
        <LoadingRow label="Loading books..." />
      ) : books.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-10 text-center space-y-2">
          <BookOpen className="h-8 w-8 text-gray-600 mx-auto" />
          <p className="text-sm font-semibold text-gray-300">No books yet</p>
          <p className="text-xs text-gray-500">Upload a textbook PDF with selectable text to get started.</p>
        </div>
      ) : (
        <div className="grid gap-2" role="radiogroup" aria-label="Books">
          {books.map((book) => {
            const ready = book.status === "completed"
            const isSelected = book.id === selectedId
            return (
              <button
                key={book.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelect(book.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors",
                  isSelected ? "border-orange-500/50 bg-orange-500/5" : "border-white/10 bg-[#0f0f11] hover:bg-[#15151a]",
                )}
              >
                <span className={cn("h-4 w-4 rounded-full border-2 shrink-0", isSelected ? "border-orange-400 bg-orange-400/40" : "border-white/25")} />
                <BookOpen className="h-4 w-4 text-gray-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{book.title}</p>
                  {book.status === "failed" && book.error && <p className="text-[11px] text-red-400 truncate">{book.error}</p>}
                </div>
                <span
                  className={cn(
                    "text-[11px] font-semibold shrink-0 flex items-center gap-1",
                    ready && "text-gray-400",
                    isBookWorking(book) && "text-amber-400",
                    book.status === "failed" && "text-red-400",
                  )}
                >
                  {isBookWorking(book) && <Loader2 className="h-3 w-3 animate-spin" />}
                  {bookStatusText(book)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
