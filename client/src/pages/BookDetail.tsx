import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Link, useParams } from "react-router"
import { ArrowLeft, BookMarked, ChevronDown, ChevronRight } from "lucide-react"
import { LoadingRow } from "@/components/workspace"
import { useResource } from "@/lib/hooks"
import type { Book, BookTocSubsection, SubsectionContent } from "@/lib/types"
import { cn } from "@/lib/utils"

function SubsectionReader({ bookId, subsection }: { bookId: string; subsection: BookTocSubsection }) {
  const content = useResource<SubsectionContent>(`/api/books/${bookId}/subsections/${subsection.id}`)
  return (
    <article className="rounded-2xl border border-white/10 bg-[#0f0f11] p-6 space-y-4">
      <header className="space-y-2 border-b border-white/5 pb-4">
        <h2 className="text-xl font-bold text-white">{subsection.name}</h2>
        <p className="text-xs text-gray-500">
          {subsection.pages[0] === subsection.pages[1] ? `Page ${subsection.pages[0]}` : `Pages ${subsection.pages[0]}–${subsection.pages[1]}`}
        </p>
        {subsection.description && <p className="text-sm text-gray-400">{subsection.description}</p>}
        {subsection.keyConcepts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {subsection.keyConcepts.map((c) => (
              <span key={c} className="text-[11px] px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-200">
                {c}
              </span>
            ))}
          </div>
        )}
      </header>
      {content.loading && <LoadingRow label="Loading..." />}
      {content.error && <p className="text-sm text-red-400">{content.error}</p>}
      {content.data && (
        <div className="text-[15px] leading-relaxed text-gray-200 space-y-3 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-white [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-white [&_h3]:font-semibold [&_h3]:text-white [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:bg-white [&_em]:text-gray-400 [&_table]:w-full [&_table]:text-sm [&_th]:border [&_th]:border-white/10 [&_th]:px-3 [&_th]:py-1.5 [&_th]:bg-white/5 [&_td]:border [&_td]:border-white/10 [&_td]:px-3 [&_td]:py-1.5 [&_pre]:bg-[#09090b] [&_pre]:border [&_pre]:border-white/10 [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-x-auto [&_code]:font-mono [&_code]:text-[13px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.data.markdown}</ReactMarkdown>
        </div>
      )}
    </article>
  )
}

export default function BookDetail() {
  const { bookId } = useParams()
  const book = useResource<Book>(`/api/books/${bookId}`)
  const [open, setOpen] = useState<BookTocSubsection | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  if (!book.data) {
    return (
      <div className="p-10">
        {book.loading ? (
          <LoadingRow label="Loading book..." />
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-red-400">{book.error ?? "Book not found"}</p>
            <Link to="/books" className="text-orange-400 hover:text-orange-300 text-sm font-semibold">
              Back to books
            </Link>
          </div>
        )}
      </div>
    )
  }

  const toc = book.data.toc

  return (
    <div className="p-6 md:p-10 flex flex-col gap-6">
      <header className="flex items-center gap-3 min-w-0">
        <Link to="/books" className="text-gray-400 hover:text-white" aria-label="Back to books">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white tracking-tight truncate">{book.data.title}</h1>
          <p className="text-sm text-gray-400">{book.data.pageCount ?? "?"} pages · the contents questions are written from</p>
        </div>
      </header>

      {!toc ? (
        <p className="text-gray-400">This book hasn&apos;t finished indexing.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-6 items-start">
          <nav className="rounded-2xl border border-white/10 bg-[#0a0a0c] p-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar" aria-label="Table of contents">
            {toc.chapters.map((chapter) => {
              const isCollapsed = collapsed[chapter.id] ?? toc.chapters.length > 3
              return (
                <div key={chapter.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => setCollapsed((p) => ({ ...p, [chapter.id]: !isCollapsed }))}
                    aria-expanded={!isCollapsed}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm font-semibold text-white hover:bg-white/5"
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />}
                    <span className="truncate">{chapter.title}</span>
                  </button>
                  {!isCollapsed &&
                    chapter.sections.map((section) => (
                      <div key={section.id} className="ml-6 mb-2">
                        <p className="px-2 pt-1 pb-0.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">{section.heading}</p>
                        <ul>
                          {section.subsections.map((sub) => (
                            <li key={sub.id}>
                              <button
                                type="button"
                                onClick={() => setOpen(sub)}
                                title={sub.description}
                                aria-current={open?.id === sub.id ? "true" : undefined}
                                className={cn(
                                  "w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors",
                                  open?.id === sub.id ? "bg-orange-600 text-white font-semibold" : "text-gray-300 hover:bg-white/5 hover:text-white",
                                )}
                              >
                                {sub.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              )
            })}
          </nav>

          {open ? (
            <SubsectionReader key={open.id} bookId={book.data.id} subsection={open} />
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center space-y-2">
              <BookMarked className="h-8 w-8 text-gray-600 mx-auto" />
              <p className="text-sm font-semibold text-gray-300">Pick a subsection</p>
              <p className="text-xs text-gray-500">See the exact text the question writer uses for it.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
