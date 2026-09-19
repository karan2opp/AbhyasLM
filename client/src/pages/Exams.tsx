import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { BookOpen, ChevronLeft, ChevronRight, Clock, FileText, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { examStage, formatDate } from "@/components/ExamRow"
import { LoadingRow, PageHeader } from "@/components/workspace"
import { useResource } from "@/lib/hooks"
import { useRole } from "@/lib/session"
import type { SessionListResponse, SessionSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 12

function ExamCard({ exam }: { exam: SessionSummary }) {
  const navigate = useNavigate()
  const role = useRole()
  const stage = examStage(exam)
  const Icon = exam.bookId ? BookOpen : FileText

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0f0f11] p-5 hover:border-orange-500/30 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="h-10 w-10 bg-orange-600/20 text-orange-400 rounded-lg flex items-center justify-center border border-orange-500/30 shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border", stage.tone)}>{stage.label}</span>
      </div>

      <p className="text-lg font-bold text-white leading-snug line-clamp-2">{exam.title || "Untitled Exam"}</p>

      <div className="rounded-xl border border-white/10 bg-black/20 p-3.5 space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs text-gray-400">
          <Clock className="h-3.5 w-3.5 text-orange-400 shrink-0" />
          {exam.sectionCount} section{exam.sectionCount === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-gray-400">Source: <span className="text-gray-200">{exam.bookId ? "From a book" : "AI generated"}</span></p>
        <p className="text-xs text-gray-400">Created: <span className="text-gray-200">{formatDate(exam.createdAt)}</span></p>
        {role === "admin" && exam.ownerEmail && (
          <p className="text-xs text-gray-400">By: <span className="text-gray-200">{exam.ownerEmail}</span></p>
        )}
      </div>

      <Button
        onClick={() => navigate(`/exams/${exam.id}`)}
        className="w-full bg-orange-600 hover:bg-orange-700 text-white h-9 text-sm font-bold"
      >
        {exam.questionsStatus === "completed" ? "Review" : "Continue"}
      </Button>
    </div>
  )
}

export default function Exams() {
  const navigate = useNavigate()
  const [inputValue, setInputValue] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)

  // Debounce the search box before it hits the backend, and jump back to page 1 on a new search.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(inputValue.trim()), 350)
    return () => clearTimeout(timer)
  }, [inputValue])

  useEffect(() => {
    setPage(1)
  }, [query])

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
  if (query) params.set("search", query)
  const sessions = useResource<SessionListResponse>(`/api/generation-agents/sessions?${params.toString()}`)

  const exams = sessions.data?.sessions ?? []
  const total = sessions.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-6 md:p-10 flex flex-col gap-6">
      <PageHeader
        title={`Exams (${total})`}
        description="Every exam you've started, from preferences through to reviewed questions. Pick one up where you left off."
        actions={
          <Button onClick={() => navigate("/exams/new")} className="bg-orange-600 hover:bg-orange-700 text-white h-10 px-5 font-semibold rounded-xl shadow-lg shadow-orange-950/40">
            <Plus className="h-4 w-4 mr-1.5" /> Create New Exam
          </Button>
        }
      />

      {sessions.error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300" role="alert">
          {sessions.error}
        </p>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search exams by title..."
          className="h-10 pl-9 bg-[#14151f] border border-white/15 text-white placeholder:text-zinc-500 text-sm rounded-lg"
        />
      </div>

      {sessions.loading ? (
        <LoadingRow label="Loading exams..." />
      ) : exams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center space-y-3">
          <FileText className="h-10 w-10 text-gray-600 mx-auto" />
          <p className="text-base text-gray-200 font-semibold">{query ? "No exams match that search" : "No exams yet"}</p>
          {!query && (
            <>
              <p className="text-sm text-gray-500 max-w-md mx-auto">Create one with AI, pull questions from past papers, or write new questions from a textbook.</p>
              <Button onClick={() => navigate("/exams/new")} className="bg-orange-600 hover:bg-orange-700 text-white h-10 px-5 font-semibold rounded-xl mt-2">
                <Plus className="h-4 w-4 mr-1.5" /> Create New Exam
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exams.map((exam) => (
              <ExamCard key={exam.id} exam={exam} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="bg-transparent border-white/15 text-gray-300 hover:text-white disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <span className="text-xs text-gray-400 font-semibold tabular-nums">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="bg-transparent border-white/15 text-gray-300 hover:text-white disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
