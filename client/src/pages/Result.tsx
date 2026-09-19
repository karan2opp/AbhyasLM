import { useState } from "react"
import { Link, useParams } from "react-router"
import { ArrowLeft, CheckCircle2, Clock, Loader2, Save, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { QuestionMarkdown } from "@/components/GeneratedQuestionList"
import { ContentBlocksView, OptionValue } from "@/components/QuestionContentBlocks"
import { LoadingRow, StatTile } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useResource } from "@/lib/hooks"
import type { ResultQuestion, SubmissionResult } from "@/lib/types"
import { cn } from "@/lib/utils"

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"]

function MarkedQuestion({
  question,
  number,
  canGrade,
  onGrade,
}: {
  question: ResultQuestion
  number: number
  canGrade: boolean
  onGrade: (answerId: string, marksAwarded: number, feedback: string) => Promise<void>
}) {
  const answer = question.answer
  const [marks, setMarks] = useState(String(answer?.marksAwarded ?? 0))
  const [feedback, setFeedback] = useState(answer?.feedback ?? "")
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!answer) return
    const value = Number(marks)
    if (!Number.isFinite(value) || value < 0 || value > question.marks) {
      toast.error(`Marks must be between 0 and ${question.marks}`)
      return
    }
    setSaving(true)
    try {
      await onGrade(answer.id, value, feedback)
    } finally {
      setSaving(false)
    }
  }

  const scored = answer?.marksAwarded ?? 0

  return (
    <article className="rounded-2xl border border-white/5 bg-[#18181b]/60 p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-orange-400 font-bold bg-orange-500/10 px-2.5 py-1 rounded text-sm">Q{number}</span>
        <span className="border border-white/10 bg-white/5 px-2.5 py-1 rounded-md text-gray-300 text-[10px] font-bold tabular-nums">
          {scored} / {question.marks}
        </span>
        {answer?.markedBy === "examiner" && <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Marked by examiner</span>}
        {answer?.markedBy === "ai" && <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">AI marked</span>}
      </div>

      <div className="text-[15px] leading-relaxed text-white">
        <QuestionMarkdown text={question.description} />
      </div>
      <ContentBlocksView blocks={question.contentBlocks} size="compact" />

      {question.type === "mcq" ? (
        <ul className="space-y-2">
          {question.options.map((option, i) => {
            const chosen = answer?.optionIds.includes(option.id)
            return (
              <li
                key={option.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border text-sm",
                  option.isCorrect
                    ? "border-green-500/30 bg-green-500/10 text-green-300"
                    : chosen
                      ? "border-red-500/30 bg-red-500/10 text-red-300"
                      : "border-white/5 bg-[#0f0f11] text-gray-400",
                )}
              >
                <span className="font-mono text-xs w-4">{LETTERS[i]}</span>
                <OptionValue value={option.value} isCode={option.isCode} size="compact" />
                {option.isCorrect && <CheckCircle2 className="h-4 w-4 ml-auto shrink-0" aria-label="Correct answer" />}
                {chosen && !option.isCorrect && <XCircle className="h-4 w-4 ml-auto shrink-0" aria-label="Your answer" />}
                {chosen && option.isCorrect && <span className="ml-auto text-[10px] font-bold uppercase">Your answer</span>}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="space-y-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Answer given</h3>
            <p className="rounded-xl border border-white/10 bg-[#0f0f11] p-4 text-sm text-gray-200 whitespace-pre-wrap">{answer?.textAnswer || "No answer given."}</p>
          </div>
          {question.rubric && (
            <details className="rounded-xl border border-white/10 bg-[#0f0f11]">
              <summary className="cursor-pointer px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-300 hover:text-white">Rubric</summary>
              <ul className="px-4 pb-3 space-y-2">
                {question.rubric.categories.map((c) => (
                  <li key={c.name} className="text-xs text-gray-400">
                    <span className="font-semibold text-gray-200">{c.name}</span> ({Math.round(c.weight * 100)}%): {c.key_points.join("; ")}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {answer?.feedback && (
        <div className="rounded-xl border border-white/10 bg-[#0f0f11] p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Feedback</h3>
          <p className="text-sm text-gray-200 whitespace-pre-wrap">{answer.feedback}</p>
        </div>
      )}

      {canGrade && answer && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">Override the mark</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block">Marks</span>
              <Input
                type="number"
                min={0}
                max={question.marks}
                step={0.5}
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                className="bg-[#14151f] border border-white/15 text-white h-9 w-24 text-center rounded-lg"
              />
            </label>
            <label className="flex-1 min-w-[220px] space-y-1">
              <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block">Feedback</span>
              <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} className="bg-[#14151f] border border-white/15 text-white rounded-lg text-sm" />
            </label>
            <Button onClick={() => void save()} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white h-9 px-4 font-semibold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1.5" /> Save</>}
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}

export default function Result() {
  const { submissionId } = useParams()
  const api = useApi()
  // While written answers are still being marked, keep checking.
  const result = useResource<SubmissionResult>(`/api/submissions/${submissionId}/result`, (r) => (r.submission.status === "evaluating" ? 4000 : null))

  const grade = async (answerId: string, marksAwarded: number, feedback: string) => {
    try {
      await api(`/api/submissions/${submissionId}/grade`, { method: "PATCH", body: JSON.stringify({ marks: [{ answerId, marksAwarded, feedback: feedback || null }] }) })
      toast.success("Mark saved")
      await result.reload()
    } catch (err) {
      toast.error((err as Error).message || "Could not save that mark")
    }
  }

  if (result.loading) return <div className="p-10"><LoadingRow label="Loading result..." /></div>
  if (!result.data) {
    return (
      <div className="p-10 text-center space-y-3">
        <p className="text-red-400">{result.error ?? "Result not found"}</p>
        <Link to="/" className="text-orange-400 hover:text-orange-300 text-sm font-semibold">
          Back
        </Link>
      </div>
    )
  }

  const { exam, submission, sections, withheld, canGrade, candidate } = result.data
  const marking = submission.status === "evaluating"
  const scored = submission.score ?? 0
  const pct = exam.totalMarks > 0 ? Math.round((scored / exam.totalMarks) * 100) : 0
  let number = 0

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex items-center gap-3 min-w-0">
          <Link to={canGrade ? `/published/${exam.id}` : "/"} className="text-gray-400 hover:text-white" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white tracking-tight truncate">{exam.title}</h1>
            <p className="text-sm text-gray-400">
              {canGrade && candidate ? `${candidate.name || candidate.email} · ` : ""}
              {submission.submittedAt ? `Submitted ${new Date(submission.submittedAt).toLocaleString()}` : "Not submitted"}
              {submission.autoSubmitted && " · submitted automatically at the deadline"}
            </p>
          </div>
        </header>

        {marking && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 flex items-center gap-2" aria-live="polite">
            <Clock className="h-4 w-4 shrink-0" /> Your written answers are being marked. This page updates itself.
          </p>
        )}
        {submission.evaluationError && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300" role="alert">
            AI marking failed: {submission.evaluationError}. An examiner can still mark these by hand.
          </p>
        )}

        {withheld ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center space-y-2">
            <p className="text-base text-gray-200 font-semibold">Results aren&apos;t available yet</p>
            <p className="text-sm text-gray-500">Your examiner will release them.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/10 bg-[#0f0f11] p-5 text-center space-y-2 sm:col-span-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Score</span>
                <p className="text-4xl font-extrabold text-white tabular-nums">
                  {marking ? "—" : scored}
                  <span className="text-lg text-gray-500"> / {exam.totalMarks}</span>
                </p>
                {!marking && (
                  <div className="w-full bg-[#14151f] border border-white/10 rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-orange-600 to-emerald-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
              <StatTile label="Percentage" value={marking ? "—" : `${pct}%`} tone={pct >= 50 ? "text-emerald-400" : "text-amber-300"} />
            </div>

            <div className="space-y-6">
              {sections.map((section) => (
                <section key={section.id} className="space-y-4">
                  <h2 className="text-lg font-bold text-white">
                    {section.title} <span className="text-xs font-normal text-gray-500">· {section.subject}</span>
                  </h2>
                  {section.questions.map((question) => (
                    <MarkedQuestion key={question.id} question={question} number={++number} canGrade={Boolean(canGrade)} onGrade={grade} />
                  ))}
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
