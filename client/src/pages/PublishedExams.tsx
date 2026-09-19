import { Link } from "react-router"
import { CalendarClock, Copy, FileText, Loader2, Pencil, Send, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingRow, PageHeader } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useAction, useResource } from "@/lib/hooks"
import type { PublishedExam } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_TONES: Record<PublishedExam["status"], string> = {
  draft: "bg-white/5 text-gray-300 border-white/10",
  published: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  closed: "bg-red-500/10 text-red-400 border-red-500/30",
}

const formatDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

export function JoinCode({ code }: { code: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(code).then(
          () => toast.success(`Code ${code} copied`),
          () => toast.error("Couldn't copy the code"),
        )
      }}
      title="Copy code"
      className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 font-mono text-sm font-bold tracking-[0.15em] text-orange-300 hover:bg-orange-500/20"
    >
      {code}
      <Copy className="h-3 w-3" />
    </button>
  )
}

function ExamRow({ exam, onChanged }: { exam: PublishedExam; onChanged: () => void }) {
  const api = useApi()

  const setStatus = useAction(async (status: PublishedExam["status"]) => {
    await api(`/api/exams/${exam.id}`, { method: "PATCH", body: JSON.stringify({ status }) })
    toast.success(status !== "published" ? "Exam closed to new attempts" : exam.status === "draft" ? "Exam published — candidates can now join" : "Exam reopened")
    onChanged()
  })

  const remove = useAction(async () => {
    await api(`/api/exams/${exam.id}`, { method: "DELETE" })
    toast.success("Exam deleted")
    onChanged()
  })

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#0f0f11] p-4 hover:border-white/10 transition-all">
      <div className="min-w-0 flex-1">
        <Link to={`/published/${exam.id}`} className="text-white font-semibold text-sm hover:text-orange-300 truncate block">
          {exam.title}
        </Link>
        <p className="text-gray-500 text-xs">
          {exam.questionCount} questions · {exam.totalMarks} marks · {exam.durationMinutes} min
        </p>
        {(exam.opensAt || exam.closesAt) && (
          <p className="text-gray-500 text-xs flex items-center gap-1 mt-0.5">
            <CalendarClock className="h-3 w-3 shrink-0" />
            {exam.opensAt && <span>Starts {formatDateTime(exam.opensAt)}</span>}
            {exam.opensAt && exam.closesAt && <span aria-hidden="true">·</span>}
            {exam.closesAt && <span>Ends {formatDateTime(exam.closesAt)}</span>}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {exam.status === "draft" ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-400">
            <FileText className="h-3 w-3" /> Not published yet
          </span>
        ) : (
          <JoinCode code={exam.joinCode} />
        )}
        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
          <Users className="h-3.5 w-3.5" /> {exam.submissionCount}
        </span>
        <span className={cn("text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider border", STATUS_TONES[exam.status])}>{exam.status}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={setStatus.busy}
          onClick={() => void setStatus.run(exam.status === "published" ? "closed" : "published")}
          className={cn(
            "h-8 px-3 text-xs font-semibold",
            exam.status === "draft" ? "bg-orange-500/10 border-orange-500/30 text-orange-300 hover:bg-orange-500/20" : "bg-transparent border-white/15 text-gray-300 hover:text-white",
          )}
        >
          {setStatus.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : exam.status === "published" ? "Close" : exam.status === "draft" ? "Publish" : "Reopen"}
        </Button>
        <Link
          to={`/published/${exam.id}/edit`}
          aria-label={`Edit ${exam.title}`}
          title="Edit exam"
          className="inline-flex size-7 items-center justify-center rounded-lg text-gray-300 hover:bg-muted hover:text-foreground transition-colors"
        >
          <Pencil className="size-3.5" />
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

export default function PublishedExams() {
  const exams = useResource<PublishedExam[]>("/api/exams")
  const list = exams.data ?? []

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader title="Published exams" description="Exams candidates can sit. Share the code with them; close an exam to stop new attempts." />

        {exams.loading ? (
          <LoadingRow label="Loading exams..." />
        ) : list.length === 0 ? (
          <Card className="bg-[#0f0f11] border border-white/10 ring-0">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Send className="size-4 text-orange-400" /> Nothing published yet
              </CardTitle>
              <CardDescription className="text-gray-400">
                Generate an exam, then use <span className="text-gray-200">Publish for candidates</span> on its review screen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/exams" className="text-sm font-semibold text-orange-400 hover:text-orange-300">
                Go to your exams
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((exam) => (
              <ExamRow key={exam.id} exam={exam} onChanged={() => void exams.reload()} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
