import { useMemo, useState } from "react"
import { Link } from "react-router"
import { CalendarClock, Copy, Loader2, Pencil, Plus, Search, Send, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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

function ExamCard({ exam, onChanged }: { exam: PublishedExam; onChanged: () => void }) {
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
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0f0f11] p-5 hover:border-orange-500/30 transition-colors">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-gray-500">
          {exam.questionCount} question{exam.questionCount === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border", STATUS_TONES[exam.status])}>{exam.status}</span>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border border-orange-500/30 bg-orange-500/10 text-orange-300">
            Max Marks {exam.totalMarks}
          </span>
        </div>
      </div>

      <Link to={`/published/${exam.id}`} className="text-lg font-bold text-white hover:text-orange-300 leading-snug line-clamp-2">
        {exam.title}
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
        {exam.status === "draft" ? (
          <span className="text-xs text-gray-500 italic">Not published yet</span>
        ) : (
          <JoinCode code={exam.joinCode} />
        )}
        <span className="inline-flex items-center gap-1 text-xs text-gray-400 shrink-0">
          <Users className="h-3.5 w-3.5" /> {exam.submissionCount}
        </span>
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-white/5">
        <Link
          to={`/published/${exam.id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-transparent px-3 h-8 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Link>
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
          to={`/published/${exam.id}`}
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

const FILTERS: { key: "all" | PublishedExam["status"]; label: string }[] = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Draft" },
  { key: "closed", label: "Closed" },
]

export default function PublishedExams() {
  const exams = useResource<PublishedExam[]>("/api/exams")
  const list = exams.data ?? []
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all")

  const filtered = useMemo(() => {
    return list.filter((exam) => {
      if (filter !== "all" && exam.status !== filter) return false
      if (query.trim() && !exam.title.toLowerCase().includes(query.trim().toLowerCase())) return false
      return true
    })
  }, [list, filter, query])

  const countFor = (key: (typeof FILTERS)[number]["key"]) => (key === "all" ? list.length : list.filter((e) => e.status === key).length)

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <PageHeader
          title={`Published exams (${list.length})`}
          description="Exams candidates can sit. Share the code with them; close an exam to stop new attempts."
          actions={
            <Link to="/exams/new">
              <Button className="bg-orange-600 hover:bg-orange-700 text-white h-10 px-5 font-semibold rounded-xl shadow-lg shadow-orange-950/40">
                <Plus className="h-4 w-4 mr-1.5" /> New Exam
              </Button>
            </Link>
          }
        />

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
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
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
                    {f.label} ({countFor(f.key)})
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-8 text-center">No exams match that search.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((exam) => (
                  <ExamCard key={exam.id} exam={exam} onChanged={() => void exams.reload()} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
