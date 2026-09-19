import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeft, CalendarClock, FileText, Loader2, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { STEPS, LoadingRow, StatTile, WizardHeader, WorkspaceShell, ghostButton, labelClass, type CreationMode } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useResource } from "@/lib/hooks"
import type { PublishedExam, Session } from "@/lib/types"
import { cn } from "@/lib/utils"

const fieldClass = "bg-[#14151f] border border-white/15 text-white placeholder:text-zinc-500 rounded-lg text-sm h-10"

/** A Date as the local "YYYY-MM-DDTHH:mm" a datetime-local input expects — Date#toISOString is UTC, which would silently shift the displayed time. */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function questionStats(session: Session) {
  const exam = session.questions
  const sections = exam?.sections ?? []
  const questionCount = sections.reduce((n, s) => n + s.topics.reduce((m, t) => m + t.questions.length, 0), 0)
  const totalMarks = sections.reduce((n, s) => n + s.topics.reduce((m, t) => m + t.questions.reduce((k, q) => k + q.marks, 0), 0), 0)
  return { sectionCount: sections.length, questionCount, totalMarks }
}

/** The dedicated last step of the exam wizard: save the generated questions as a draft, or publish them for candidates. */
export default function PublishExam() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const api = useApi()
  const session = useResource<Session>(`/api/generation-agents/sessions/${sessionId}`)

  const [duration, setDuration] = useState("")
  const [opensAt, setOpensAt] = useState("")
  const [closesAt, setClosesAt] = useState("")
  const [saving, setSaving] = useState<"draft" | "published" | null>(null)
  const [initialized, setInitialized] = useState(false)

  // Suggest a duration and a week-long join window once the session loads — a teacher can override any of it.
  useEffect(() => {
    if (!session.data || initialized) return
    setInitialized(true)
    const { questionCount } = questionStats(session.data)
    setDuration(String(Math.max(10, questionCount * 2)))
    const now = new Date()
    setOpensAt(toLocalInputValue(now))
    setClosesAt(toLocalInputValue(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)))
  }, [session.data, initialized])

  if (session.loading && !session.data) return <div className="p-10"><LoadingRow label="Loading exam..." /></div>

  const s = session.data
  if (!s) {
    return (
      <div className="p-10 text-center space-y-3">
        <p className="text-red-400">{session.error ?? "Exam not found"}</p>
        <Link to="/exams" className="text-orange-400 hover:text-orange-300 text-sm font-semibold">
          Back to exams
        </Link>
      </div>
    )
  }

  if (s.questionsStatus !== "completed" || !s.questions) {
    return (
      <div className="p-10 text-center space-y-3">
        <p className="text-gray-300">This exam&apos;s questions aren&apos;t ready to publish yet.</p>
        <Link to={`/exams/${s.id}`} className="text-orange-400 hover:text-orange-300 text-sm font-semibold">
          Go back to it
        </Link>
      </div>
    )
  }

  const mode: CreationMode = s.examInput.bookId ? "source" : "ai"
  const stats = questionStats(s)
  const instructions = s.examInput.instructions ?? []

  const save = async (status: "draft" | "published") => {
    const minutes = Number(duration)
    if (!Number.isFinite(minutes) || minutes < 1) {
      toast.error("Enter how long candidates get, in minutes")
      return
    }
    if (!opensAt || !closesAt) {
      toast.error("Set both a start and end time")
      return
    }
    if (new Date(closesAt) <= new Date(opensAt)) {
      toast.error("The closing time must be after the opening time")
      return
    }
    setSaving(status)
    try {
      const exam = await api<PublishedExam>("/api/exams/publish", {
        method: "POST",
        body: JSON.stringify({
          sessionId: s.id,
          durationMinutes: minutes,
          instructions,
          opensAt: new Date(opensAt).toISOString(),
          closesAt: new Date(closesAt).toISOString(),
          status,
        }),
      })
      toast.success(status === "published" ? `Published. Candidates join with code ${exam.joinCode}` : "Saved as a draft — publish it when you're ready")
      navigate(`/published/${exam.id}`)
    } catch (err) {
      toast.error((err as Error).message || "Could not save this exam")
      setSaving(null)
    }
  }

  const busy = saving !== null

  return (
    <div className="p-4 md:p-6 flex flex-col gap-3 lg:h-full lg:min-h-0">
      <div className="flex items-center gap-3 shrink-0 min-w-0">
        <Link to={`/exams/${s.id}`} className="text-gray-400 hover:text-white" aria-label="Back to review">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-base font-bold text-white tracking-tight truncate">Publish: {s.examInput.title || "Untitled Exam"}</h1>
      </div>

      <div className="flex-1 lg:min-h-0">
        <WorkspaceShell
          header={<WizardHeader mode={mode} currentStep={STEPS[mode].length - 1} />}
          left={
            <div className="space-y-6 max-w-2xl">
              <div>
                <h2 className="text-lg font-bold text-white">Publishing settings</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Save this as a draft to come back to later, or publish it now to hand candidates a join code straight away.
                </p>
              </div>

              <label className="block space-y-1.5">
                <span className={labelClass}>Time limit (minutes)</span>
                <Input type="number" min={1} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} className={cn(fieldClass, "w-40 font-bold")} />
                <span className="block text-xs text-gray-500">A candidate is auto-submitted once this runs out, from the moment they join.</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <label className="block space-y-1.5">
                  <span className={labelClass}>Start time</span>
                  <Input type="datetime-local" required value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className={cn(fieldClass, "[color-scheme:dark]")} />
                </label>
                <label className="block space-y-1.5">
                  <span className={labelClass}>End time</span>
                  <Input type="datetime-local" required value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={cn(fieldClass, "[color-scheme:dark]")} />
                </label>
              </div>
              <p className="text-xs text-gray-500 -mt-3">
                Both are required — outside this window nobody can start the exam. A candidate who joins still only gets the time limit above, even if the window stays open longer.
              </p>

              {instructions.length > 0 && (
                <div className="space-y-1.5">
                  <span className={labelClass}>Instructions candidates will see</span>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-gray-300 rounded-xl border border-white/10 bg-[#0f0f11] p-4">
                    {instructions.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          }
          right={
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2.5">
                <StatTile label="Sections" value={stats.sectionCount} />
                <StatTile label="Questions" value={stats.questionCount} tone="text-orange-300" />
                <StatTile label="Marks" value={stats.totalMarks} tone="text-emerald-400" />
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0f0f11] p-4 space-y-3 text-xs text-gray-400 leading-relaxed">
                <p className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
                  <span>
                    <span className="font-semibold text-gray-200">Save as Draft</span> stores the exam with a join code that doesn&apos;t work yet — nobody can join until you publish it.
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <Send className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
                  <span>
                    <span className="font-semibold text-gray-200">Publish</span> opens it immediately — candidates can join with the code as soon as it&apos;s live.
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <CalendarClock className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
                  <span>Either way, you can change the schedule, close it, or publish a draft later from the Published exams page.</span>
                </p>
              </div>
            </div>
          }
          footer={
            <>
              <Button variant="ghost" disabled={busy} onClick={() => navigate(`/exams/${s.id}`)} className={ghostButton}>
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Review
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void save("draft")}
                  className="bg-transparent border-white/15 text-gray-200 hover:bg-white/5 h-10 px-4 text-sm font-semibold"
                >
                  {saving === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><FileText className="h-4 w-4 mr-2" /> Save as Draft</>}
                </Button>
                <Button
                  onClick={() => void save("published")}
                  disabled={busy}
                  className="bg-orange-600 hover:bg-orange-700 text-white h-10 px-6 font-bold text-sm rounded-xl shadow-lg shadow-orange-950/40"
                >
                  {saving === "published" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-2" /> Publish</>}
                </Button>
              </div>
            </>
          }
        />
      </div>
    </div>
  )
}
