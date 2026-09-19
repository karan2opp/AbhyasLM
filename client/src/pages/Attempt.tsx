import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { AlertTriangle, Check, CheckCircle2, Clock, Loader2, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ContentBlocksView, OptionValue } from "@/components/QuestionContentBlocks"
import { QuestionMarkdown } from "@/components/GeneratedQuestionList"
import { LoadingRow } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useResource } from "@/lib/hooks"
import type { CandidatePaper, PaperQuestion } from "@/lib/types"
import { cn } from "@/lib/utils"

const AUTOSAVE_MS = 900
const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"]

type Draft = { optionIds: string[]; textAnswer: string }

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function Countdown({ deadline, onExpire }: { deadline: string; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(() => new Date(deadline).getTime() - Date.now())
  const firedRef = useRef(false)

  useEffect(() => {
    const timer = setInterval(() => {
      const left = new Date(deadline).getTime() - Date.now()
      setRemaining(left)
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true
        onExpire()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [deadline, onExpire])

  const urgent = remaining <= 5 * 60_000
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold tabular-nums",
        urgent ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-white/10 bg-[#14151f] text-white",
      )}
      role="timer"
      aria-live="off"
    >
      <Clock className="h-4 w-4" /> {formatRemaining(remaining)}
    </span>
  )
}

export default function Attempt() {
  const { submissionId } = useParams()
  const api = useApi()
  const navigate = useNavigate()
  const paper = useResource<CandidatePaper>(`/api/submissions/${submissionId}/paper`)

  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [current, setCurrent] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const loadedRef = useRef(false)
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Saved answers come back with the paper, so a refresh mid-exam picks up where it left off.
  useEffect(() => {
    if (!paper.data || loadedRef.current) return
    loadedRef.current = true
    const initial: Record<string, Draft> = {}
    for (const answer of paper.data.answers) {
      initial[answer.questionId] = { optionIds: answer.optionIds, textAnswer: answer.textAnswer ?? "" }
    }
    setDrafts(initial)
  }, [paper.data])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer)
    }
  }, [])

  const questions: PaperQuestion[] = useMemo(() => (paper.data?.sections ?? []).flatMap((s) => s.questions), [paper.data])
  const sectionOf = useCallback(
    (questionId: string) => (paper.data?.sections ?? []).find((s) => s.questions.some((q) => q.id === questionId)),
    [paper.data],
  )

  const persist = useCallback(
    async (questionId: string, draft: Draft) => {
      setSaving((prev) => ({ ...prev, [questionId]: true }))
      try {
        await api(`/api/submissions/${submissionId}/answers`, {
          method: "POST",
          body: JSON.stringify({ questionId, optionIds: draft.optionIds, textAnswer: draft.textAnswer || null }),
        })
      } catch (err) {
        toast.error((err as Error).message || "Couldn't save that answer")
      } finally {
        setSaving((prev) => ({ ...prev, [questionId]: false }))
      }
    },
    [api, submissionId],
  )

  // Typing saves shortly after you stop; picking an option saves at once.
  const update = (questionId: string, draft: Draft, immediate: boolean) => {
    setDrafts((prev) => ({ ...prev, [questionId]: draft }))
    clearTimeout(timersRef.current[questionId])
    if (immediate) {
      void persist(questionId, draft)
    } else {
      timersRef.current[questionId] = setTimeout(() => void persist(questionId, draft), AUTOSAVE_MS)
    }
  }

  const submit = useCallback(
    async (auto: boolean) => {
      setSubmitting(true)
      try {
        // Flush anything still waiting on the autosave timer.
        for (const [questionId, timer] of Object.entries(timersRef.current)) {
          clearTimeout(timer)
          const draft = drafts[questionId]
          if (draft) await persist(questionId, draft)
        }
        await api(`/api/submissions/${submissionId}/submit`, { method: "POST" })
        toast.success(auto ? "Time's up — your answers were submitted" : "Submitted. Your answers are being marked.")
        navigate(`/results/${submissionId}`)
      } catch (err) {
        toast.error((err as Error).message || "Could not submit")
        setSubmitting(false)
      }
    },
    [api, drafts, navigate, persist, submissionId],
  )

  const onExpire = useCallback(() => {
    if (!submitting) void submit(true)
  }, [submit, submitting])

  if (paper.loading) return <div className="p-10"><LoadingRow label="Loading your exam..." /></div>
  if (!paper.data) {
    return (
      <div className="p-10 text-center space-y-3">
        <p className="text-red-400">{paper.error ?? "This attempt isn't available"}</p>
        <Link to="/" className="text-orange-400 hover:text-orange-300 text-sm font-semibold">
          Back to my exams
        </Link>
      </div>
    )
  }

  const question = questions[current]
  const draft = (question && drafts[question.id]) ?? { optionIds: [], textAnswer: "" }
  const answeredCount = questions.filter((q) => {
    const d = drafts[q.id]
    return d && (d.optionIds.length > 0 || d.textAnswer.trim().length > 0)
  }).length

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Exam header: title, progress and the countdown */}
      <header className="shrink-0 border-b border-white/10 bg-black px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-bold text-white truncate">{paper.data.exam.title}</h1>
          <p className="text-xs text-gray-500">
            {answeredCount} of {questions.length} answered · {paper.data.exam.totalMarks} marks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Countdown deadline={paper.data.submission.deadlineAt} onExpire={onExpire} />
          <Button
            onClick={() => {
              if (confirm(`Submit now? You've answered ${answeredCount} of ${questions.length} questions and can't change them afterwards.`)) void submit(false)
            }}
            disabled={submitting}
            className="bg-orange-600 hover:bg-orange-700 text-white h-9 px-4 font-bold rounded-xl"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1.5" /> Submit</>}
          </Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* Current question */}
        <main className="overflow-y-auto custom-scrollbar p-4 md:p-8">
          {paper.data.exam.instructions.length > 0 && current === 0 && (
            <div className="mb-6 rounded-xl border border-white/10 bg-[#0f0f11] p-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-2">Instructions</h2>
              <ul className="list-disc pl-5 space-y-1 text-sm text-gray-400">
                {paper.data.exam.instructions.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {question && (
            <article className="max-w-3xl space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-orange-400 font-bold bg-orange-500/10 px-2.5 py-1 rounded text-sm">Q{current + 1}</span>
                <span className="text-xs text-gray-500">{sectionOf(question.id)?.title}</span>
                <span className="border border-white/10 bg-white/5 px-2.5 py-1 rounded-md text-gray-300 text-[10px] font-bold">
                  {question.marks} mark{question.marks === 1 ? "" : "s"}
                </span>
                {saving[question.id] ? (
                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Saving
                  </span>
                ) : (
                  drafts[question.id] && (
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Saved
                    </span>
                  )
                )}
              </div>

              <div className="text-[17px] leading-relaxed text-white">
                <QuestionMarkdown text={question.description} />
              </div>
              <ContentBlocksView blocks={question.contentBlocks} size="large" />

              {question.type === "mcq" ? (
                <div className="space-y-2.5" role="radiogroup" aria-label={`Options for question ${current + 1}`}>
                  {question.options.map((option, i) => {
                    const isChosen = draft.optionIds.includes(option.id)
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={isChosen}
                        onClick={() => update(question.id, { ...draft, optionIds: isChosen ? [] : [option.id] }, true)}
                        className={cn(
                          "w-full flex items-center gap-3 p-4 rounded-xl border text-left text-[15px] transition-all",
                          isChosen ? "bg-orange-500/10 border-orange-500/50 text-white" : "bg-[#0f0f11] border-white/10 text-gray-300 hover:border-white/25",
                        )}
                      >
                        <span className={cn("h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-bold", isChosen ? "border-orange-400 bg-orange-500 text-white" : "border-white/20 text-gray-500")}>
                          {LETTERS[i]}
                        </span>
                        <OptionValue value={option.value} isCode={option.isCode} size="large" />
                      </button>
                    )
                  })}
                </div>
              ) : (
                <Textarea
                  value={draft.textAnswer}
                  onChange={(e) => update(question.id, { ...draft, textAnswer: e.target.value }, false)}
                  rows={12}
                  placeholder="Write your answer here..."
                  aria-label={`Answer for question ${current + 1}`}
                  className="bg-[#14151f] border border-white/15 text-white placeholder:text-zinc-500 rounded-xl text-[15px] leading-relaxed"
                />
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button variant="ghost" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)} className="text-gray-400 hover:text-white h-10 px-4 text-sm font-semibold">
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={current >= questions.length - 1}
                  onClick={() => setCurrent((c) => c + 1)}
                  className="bg-transparent border-white/15 text-white hover:bg-white/5 h-10 px-5 text-sm font-semibold"
                >
                  Next question
                </Button>
              </div>
            </article>
          )}
        </main>

        {/* Question map */}
        <aside className="border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0a0a0c] p-4 overflow-y-auto custom-scrollbar" aria-label="Questions">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Questions</h2>
          <div className="grid grid-cols-6 lg:grid-cols-5 gap-2">
            {questions.map((q, i) => {
              const d = drafts[q.id]
              const answered = d && (d.optionIds.length > 0 || d.textAnswer.trim().length > 0)
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrent(i)}
                  aria-current={i === current ? "true" : undefined}
                  aria-label={`Question ${i + 1}${answered ? ", answered" : ""}`}
                  className={cn(
                    "h-9 rounded-lg border text-xs font-bold tabular-nums transition-colors",
                    i === current
                      ? "border-orange-400 bg-orange-600 text-white"
                      : answered
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-white/10 bg-[#0f0f11] text-gray-400 hover:border-white/25",
                  )}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>

          <div className="mt-6 space-y-2 text-xs text-gray-500">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Answers save as you go
            </p>
            <p className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Submitted automatically at 0:00
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
