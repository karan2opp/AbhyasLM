import { Link, useParams } from "react-router"
import { ArrowLeft, CalendarClock, Eye, EyeOff, Loader2, Pencil, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { JoinCode } from "@/pages/PublishedExams"
import { LoadingRow, StatTile } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useAction, useResource } from "@/lib/hooks"
import type { ExamSubmissionRow, PublishedExam } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_LABELS: Record<ExamSubmissionRow["status"], string> = {
  in_progress: "Taking it now",
  evaluating: "Marking",
  submitted: "Marked",
}

const STATUS_TONES: Record<ExamSubmissionRow["status"], string> = {
  in_progress: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  evaluating: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  submitted: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
}

const formatDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

export default function PublishedExamDetail() {
  const { examId } = useParams()
  const api = useApi()
  const exams = useResource<PublishedExam[]>("/api/exams")
  const submissions = useResource<ExamSubmissionRow[]>(`/api/exams/${examId}/submissions`, (rows) =>
    rows.some((r) => r.status !== "submitted") ? 6000 : null,
  )
  const exam = (exams.data ?? []).find((e) => e.id === examId)

  const toggleResults = useAction(async () => {
    await api(`/api/exams/${examId}`, { method: "PATCH", body: JSON.stringify({ resultsVisible: !exam!.resultsVisible }) })
    toast.success(exam!.resultsVisible ? "Results hidden from candidates" : "Results released to candidates")
    await exams.reload()
  })

  const publish = useAction(async () => {
    const published = await api<PublishedExam>(`/api/exams/${examId}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) })
    toast.success(`Published. Candidates join with code ${published.joinCode}`)
    await exams.reload()
  })

  if (exams.loading) return <div className="p-10"><LoadingRow label="Loading exam..." /></div>
  if (!exam) {
    return (
      <div className="p-10 text-center space-y-3">
        <p className="text-red-400">{exams.error ?? "Exam not found"}</p>
        <Link to="/published" className="text-orange-400 hover:text-orange-300 text-sm font-semibold">
          Back to published exams
        </Link>
      </div>
    )
  }

  const rows = submissions.data ?? []
  const marked = rows.filter((r) => r.status === "submitted")
  const average = marked.length > 0 ? Math.round((marked.reduce((sum, r) => sum + (r.score ?? 0), 0) / marked.length) * 10) / 10 : null

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/published" className="text-gray-400 hover:text-white" aria-label="Back to published exams">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white tracking-tight truncate">{exam.title}</h1>
              <p className="text-sm text-gray-400">
                {exam.questionCount} questions · {exam.totalMarks} marks · {exam.durationMinutes} minutes
              </p>
              {(exam.opensAt || exam.closesAt) && (
                <p className="text-sm text-gray-400 flex items-center gap-1.5 mt-0.5">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  {exam.opensAt && <span>Starts {formatDateTime(exam.opensAt)}</span>}
                  {exam.opensAt && exam.closesAt && <span aria-hidden="true">·</span>}
                  {exam.closesAt && <span>Ends {formatDateTime(exam.closesAt)}</span>}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {exam.status === "draft" ? (
              <Button onClick={() => void publish.run()} disabled={publish.busy} className="bg-orange-600 hover:bg-orange-700 text-white h-9 px-4 text-sm font-bold rounded-xl">
                {publish.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1.5" /> Publish now</>}
              </Button>
            ) : (
              <JoinCode code={exam.joinCode} />
            )}
            <Button
              variant="outline"
              disabled={toggleResults.busy}
              onClick={() => void toggleResults.run()}
              className="bg-transparent border-white/15 text-gray-300 hover:text-white h-9 px-4 text-sm font-semibold"
            >
              {toggleResults.busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : exam.resultsVisible ? (
                <>
                  <Eye className="h-4 w-4 mr-1.5" /> Results visible
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4 mr-1.5" /> Results hidden
                </>
              )}
            </Button>
            <Link
              to={`/published/${exam.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-transparent px-4 h-9 text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </div>
        </header>

        {exam.status === "draft" && (
          <p className="rounded-xl border border-white/10 bg-[#0f0f11] px-4 py-3 text-sm text-gray-300">
            This exam is a draft — candidates can&apos;t join it yet. Click <span className="font-semibold text-white">Publish now</span> when you&apos;re ready.
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Attempts" value={rows.length} />
          <StatTile label="Marked" value={marked.length} tone="text-emerald-400" />
          <StatTile label="In progress" value={rows.filter((r) => r.status === "in_progress").length} tone="text-amber-300" />
          <StatTile label="Average" value={average === null ? "—" : `${average} / ${exam.totalMarks}`} tone="text-orange-300" />
        </div>

        <Card className="bg-[#0f0f11] border border-white/10 ring-0">
          <CardHeader>
            <CardTitle className="text-white">Candidates</CardTitle>
            <CardDescription className="text-gray-400">Open an attempt to see the marked paper and change any mark.</CardDescription>
          </CardHeader>
          <CardContent>
            {submissions.loading ? (
              <LoadingRow label="Loading attempts..." />
            ) : rows.length === 0 ? (
              <p className="text-xs italic text-gray-500">Nobody has taken this exam yet. Share the code above.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {rows.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0b0b0d] p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">{row.name || row.email || row.userId}</p>
                      <p className="text-xs text-gray-500">
                        {row.submittedAt ? `Submitted ${new Date(row.submittedAt).toLocaleString()}` : `Started ${new Date(row.startedAt).toLocaleString()}`}
                        {row.autoSubmitted && " · auto-submitted"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white tabular-nums">
                        {row.score === null ? "—" : `${row.score} / ${exam.totalMarks}`}
                      </span>
                      <span className={cn("text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider border", STATUS_TONES[row.status])}>{STATUS_LABELS[row.status]}</span>
                      {row.status !== "in_progress" && (
                        <Link to={`/results/${row.id}`} className="text-xs font-semibold text-orange-400 hover:text-orange-300 px-2">
                          Open
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
