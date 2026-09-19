import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router"
import { BookOpen, CalendarClock, ChevronLeft, ChevronRight, Clock, FileText, Loader2, Pencil, Plus, Search, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { JoinCode } from "@/components/JoinCode"
import { examStage, formatDate } from "@/components/ExamRow"
import { LoadingRow, PageHeader } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useAction, useResource } from "@/lib/hooks"
import { useRole } from "@/lib/session"
import type { ExamStatus, SessionListResponse, SessionSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 12

const STATUS_TONES: Record<ExamStatus, string> = {
  draft: "bg-white/5 text-gray-300 border-white/10",
  published: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  closed: "bg-red-500/10 text-red-400 border-red-500/30",
}

const formatDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

/** A session that hasn't been published yet — still in, or just finished, generation. */
function InProgressCard({ exam }: { exam: SessionSummary }) {
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
        <p className="text-xs text-gray-400">
          Source: <span className="text-gray-200">{exam.bookId ? "From a book" : "AI generated"}</span>
        </p>
        <p className="text-xs text-gray-400">
          Created: <span className="text-gray-200">{formatDate(exam.createdAt)}</span>
        </p>
        {role === "admin" && exam.ownerEmail && (
          <p className="text-xs text-gray-400">
            By: <span className="text-gray-200">{exam.ownerEmail}</span>
          </p>
        )}
      </div>

      <Button onClick={() => navigate(`/exams/${exam.id}`)} className="w-full bg-orange-600 hover:bg-orange-700 text-white h-9 text-sm font-bold">
        {exam.questionsStatus === "completed" ? "Review" : "Continue"}
      </Button>
    </div>
  )
}

/** A session that's been published — draft, live, or closed. */
function PublishedCard({ exam, onChanged }: { exam: SessionSummary; onChanged: () => void }) {
  const api = useApi()
  const examId = exam.examId!

  const setStatus = useAction(async (status: ExamStatus) => {
    await api(`/api/exams/${examId}`, { method: "PATCH", body: JSON.stringify({ status }) })
    toast.success(status !== "published" ? "Exam closed to new attempts" : exam.publishStatus === "draft" ? "Exam published — candidates can now join" : "Exam reopened")
    onChanged()
  })

  const remove = useAction(async () => {
    await api(`/api/exams/${examId}`, { method: "DELETE" })
    toast.success("Exam deleted")
    onChanged()
  })

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0f0f11] p-5 hover:border-orange-500/30 transition-colors">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-gray-500">
          {exam.examQuestionCount ?? 0} question{exam.examQuestionCount === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border", STATUS_TONES[exam.publishStatus])}>{exam.publishStatus}</span>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border border-orange-500/30 bg-orange-500/10 text-orange-300">
            Max Marks {exam.totalMarks}
          </span>
        </div>
      </div>

      <Link to={`/published/${examId}`} className="text-lg font-bold text-white hover:text-orange-300 leading-snug line-clamp-2">
        {exam.title || "Untitled Exam"}
      </Link>

      <div className="rounded-xl border border-white/10 bg-black/20 p-3.5 space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 mb-1.5">
          <CalendarClock className="h-3.5 w-3.5 text-orange-400" /> Timeline &amp; Details
        </p>
        <p className="text-xs text-gray-400">
          Start: <span className="text-gray-200">{exam.opensAt ? formatDateTime(exam.opensAt) : "—"}</span>
        </p>
        <p className="text-xs text-gray-400">
          Due: <span className="text-gray-200">{exam.closesAt ? formatDateTime(exam.closesAt) : "—"}</span>
        </p>
        <p className="text-xs text-gray-400">
          Duration: <span className="text-orange-300 font-semibold">{exam.durationMinutes} mins</span>
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        {exam.publishStatus === "draft" ? (
          <span className="text-xs text-gray-500 italic">Not published yet</span>
        ) : (
          exam.joinCode && <JoinCode code={exam.joinCode} />
        )}
        <span className="inline-flex items-center gap-1 text-xs text-gray-400 shrink-0">
          <Users className="h-3.5 w-3.5" /> {exam.submissionCount ?? 0}
        </span>
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-white/5">
        <Link
          to={`/published/${examId}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-transparent px-3 h-8 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Link>
        <Button
          variant="outline"
          size="sm"
          disabled={setStatus.busy}
          onClick={() => void setStatus.run(exam.publishStatus === "published" ? "closed" : "published")}
          className={cn(
            "h-8 px-3 text-xs font-semibold",
            exam.publishStatus === "draft" ? "bg-orange-500/10 border-orange-500/30 text-orange-300 hover:bg-orange-500/20" : "bg-transparent border-white/15 text-gray-300 hover:text-white",
          )}
        >
          {setStatus.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : exam.publishStatus === "published" ? "Close" : exam.publishStatus === "draft" ? "Publish" : "Reopen"}
        </Button>
        <Link
          to={`/published/${examId}`}
          className="flex-1 inline-flex items-center justify-center rounded-lg bg-orange-600 hover:bg-orange-700 px-3 h-8 text-xs font-bold text-white transition-colors"
        >
          Results
        </Link>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={remove.busy}
          aria-label={`Delete ${exam.title}`}
          onClick={() => {
            if (confirm(`Delete "${exam.title}"? Candidate attempts and results for it are deleted too.`)) void remove.run()
          }}
        >
          {remove.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5 text-red-400" />}
        </Button>
      </div>
    </div>
  )
}

const FILTERS: { key: "all" | ExamStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Draft" },
  { key: "closed", label: "Closed" },
]

export default function Exams() {
  const navigate = useNavigate()
  const [inputValue, setInputValue] = useState("")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all")
  const [page, setPage] = useState(1)

  // Debounce the search box before it hits the backend, and jump back to page 1 on a new search or filter.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(inputValue.trim()), 350)
    return () => clearTimeout(timer)
  }, [inputValue])

  useEffect(() => {
    setPage(1)
  }, [query, filter])

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
  if (query) params.set("search", query)
  if (filter !== "all") params.set("status", filter)
  const sessions = useResource<SessionListResponse>(`/api/generation-agents/sessions?${params.toString()}`)

  const exams = sessions.data?.sessions ?? []
  const total = sessions.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-6 md:p-10 flex flex-col gap-6">
      <PageHeader
        title={`Exams (${total})`}
        description="Every exam you've started, from preferences through to published results. Pick one up where you left off."
        actions={
          <Button onClick={() => navigate("/exams/new")} className="bg-orange-600 hover:bg-orange-700 text-white h-10 px-5 font-semibold rounded-xl shadow-lg shadow-orange-950/40">
            <Plus className="h-4 w-4 mr-1.5" /> New Exam
          </Button>
        }
      />

      {sessions.error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300" role="alert">
          {sessions.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search exams by title..."
            className="h-10 pl-9 bg-[#14151f] border border-white/15 text-white placeholder:text-zinc-500 text-sm rounded-lg"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "h-9 px-3.5 rounded-lg text-xs font-bold transition-colors",
                filter === f.key ? "bg-orange-600 text-white" : "bg-[#14151f] border border-white/10 text-gray-400 hover:text-white",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {sessions.loading ? (
        <LoadingRow label="Loading exams..." />
      ) : exams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center space-y-3">
          <FileText className="h-10 w-10 text-gray-600 mx-auto" />
          <p className="text-base text-gray-200 font-semibold">{query || filter !== "all" ? "No exams match that search" : "No exams yet"}</p>
          {!query && filter === "all" && (
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
            {exams.map((exam) =>
              exam.examId ? (
                <PublishedCard key={exam.id} exam={exam} onChanged={() => void sessions.reload()} />
              ) : (
                <InProgressCard key={exam.id} exam={exam} />
              ),
            )}
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
