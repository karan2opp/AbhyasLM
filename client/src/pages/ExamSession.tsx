import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeft, Download, RotateCcw, Send, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AgentChat } from "@/components/AgentChat"
import { BlueprintTreeViewer, buildSourceLookup, countBlueprintQuestions } from "@/components/BlueprintTreeViewer"
import { ConfigRecap, ExamSummaryCard } from "@/components/ExamForms"
import { GeneratedQuestionList } from "@/components/GeneratedQuestionList"
import { GeneratingLoader, LoadingRow, StatTile, WizardHeader, WorkspaceShell, ghostButton, primaryButton, type CreationMode } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useResource } from "@/lib/hooks"
import type { BlueprintSection, Book, ChatTurn, GeneratedExam, IntentTurnResult, Session } from "@/lib/types"

const POLL_MS = 2500

type Stage = "intent" | "planning" | "blueprint" | "generating" | "review"

function stageOf(s: Session): Stage {
  if (s.status !== "completed") return "intent"
  if (s.blueprintStatus !== "completed") return "planning"
  if (s.questionsStatus === "in_progress") return "generating"
  if (s.questionsStatus === "completed") return "review"
  return "blueprint"
}

// Position of each stage in STEPS.ai / STEPS.source (the source flow has an extra "Book" step).
const STEP_INDEX: Record<Stage, number> = { intent: 2, planning: 3, blueprint: 3, generating: 4, review: 5 }

const skipLabel = (content: string) =>
  content.startsWith("[[SKIP_ALL]]") ? "(Skipped all remaining questions)" : content.startsWith("[[SKIP_QUESTION]]") ? "(Skipped this question)" : content

export default function ExamSession() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const api = useApi()
  const session = useResource<Session>(`/api/generation-agents/sessions/${sessionId}`, (s) =>
    s.blueprintStatus === "in_progress" || s.questionsStatus === "in_progress" ? POLL_MS : null,
  )
  const s = session.data
  const reload = session.reload

  // Planning starts as soon as the conversation ends. Once per visit: React runs effects twice in
  // development, and each call would start a separate planning job.
  const autoPlanned = useRef(false)
  const startPlanning = useCallback(async () => {
    try {
      await api("/api/generation-agents/blueprint/generate", { method: "POST", body: JSON.stringify({ sessionId }) })
      await reload()
    } catch (err) {
      toast.error((err as Error).message || "Failed to plan subtopics")
    }
  }, [api, sessionId, reload])
  const needsPlanning = s?.status === "completed" && s.blueprintStatus === "pending"
  useEffect(() => {
    if (!needsPlanning || autoPlanned.current) return
    autoPlanned.current = true
    void startPlanning()
  }, [needsPlanning, startPlanning])

  // The book's index, for showing which pages each subtopic will be written from.
  const book = useResource<Book>(s?.examInput.bookId ? `/api/books/${s.examInput.bookId}` : null)
  const sourceLookup = useMemo(() => (book.data?.toc ? buildSourceLookup(book.data.toc) : undefined), [book.data])

  if (!s) {
    return (
      <div className="p-10">
        {session.loading ? (
          <LoadingRow label="Loading exam..." />
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-red-400">{session.error ?? "Exam not found"}</p>
            <Link to="/exams" className="text-orange-400 hover:text-orange-300 text-sm font-semibold">
              Back to exams
            </Link>
          </div>
        )}
      </div>
    )
  }

  const mode: CreationMode = s.examInput.bookId ? "source" : "ai"
  const stage = stageOf(s)
  const step = STEP_INDEX[stage] + (mode === "source" ? 1 : 0)
  const header = <WizardHeader mode={mode} currentStep={step} />
  const summaryCard = <ExamSummaryCard sections={s.examInput.sections.map((x) => ({ questionCount: x.question_count, marksEach: x.marks }))} />

  let content
  if (stage === "intent") {
    content = <IntentStage key="intent" session={s} header={header} onDone={reload} onCancel={() => navigate("/exams")} />
  } else if (stage === "planning") {
    content = (
      <WorkspaceShell
        header={header}
        left={
          s.blueprintStatus === "failed" ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-4 text-center">
              <p className="text-sm font-bold text-white">Planning failed</p>
              <p className="text-xs text-red-400 max-w-md">{s.blueprintError ?? "Unknown error"}</p>
              <Button onClick={() => void startPlanning()} className={primaryButton}>
                <RotateCcw className="h-4 w-4 mr-2" /> Try again
              </Button>
            </div>
          ) : (
            <GeneratingLoader title="Planning subtopics..." message="Weighing each topic and sharing out the questions. This usually takes under a minute." />
          )
        }
        right={summaryCard}
      />
    )
  } else if (stage === "blueprint") {
    content = <BlueprintStage key="blueprint" session={s} header={header} sourceLookup={sourceLookup} onGenerated={reload} />
  } else if (stage === "generating") {
    const total = countBlueprintQuestions(s.blueprint?.sections ?? [])
    const done = (s.questions?.sections ?? []).reduce((n, sec) => n + sec.topics.reduce((m, t) => m + t.questions.length, 0), 0)
    content = (
      <WorkspaceShell
        header={header}
        left={<GeneratingLoader title="Generating questions..." progress={{ done, total }} message="Written section by section, and every MCQ answer is checked before it's saved." />}
        right={summaryCard}
      />
    )
  } else {
    content = <ReviewStage key="review" session={s} header={header} />
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-3 lg:h-full lg:min-h-0">
      <div className="flex items-center gap-3 shrink-0 min-w-0">
        <Link to="/exams" className="text-gray-400 hover:text-white" aria-label="Back to exams">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-base font-bold text-white tracking-tight truncate">{s.examInput.title || "Untitled Exam"}</h1>
        {stage === "review" && (
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-[10px] font-bold text-emerald-400 uppercase tracking-wider border border-emerald-500/30">Questions ready</span>
        )}
      </div>
      <div className="flex-1 lg:min-h-0">{content}</div>
    </div>
  )
}

// ── Preferences: Exam Intent Agent ─────────────────────────────────────────

function IntentStage({ session, header, onDone, onCancel }: { session: Session; header: React.ReactNode; onDone: () => Promise<void>; onCancel: () => void }) {
  const api = useApi()
  const [turns, setTurns] = useState<ChatTurn[]>(session.intentHistory.map((t) => ({ ...t, content: skipLabel(t.content) })))
  const [thinking, setThinking] = useState(false)

  const send = async (body: { message?: string; action?: "skip_question" | "skip_all" }, shown: string) => {
    setTurns((prev) => [...prev, { role: "user", content: shown }])
    setThinking(true)
    try {
      const result = await api<IntentTurnResult>("/api/generation-agents/conversation", { method: "POST", body: JSON.stringify({ sessionId: session.id, ...body }) })
      setTurns((prev) => [...prev, { role: "assistant", content: result.message }])
      if (result.done) {
        toast.success("Preferences saved. Planning subtopics...")
        await onDone()
      }
      return true
    } catch (err) {
      toast.error((err as Error).message || "Conversation turn failed")
      setTurns((prev) => prev.slice(0, -1))
      return false
    } finally {
      setThinking(false)
    }
  }

  return (
    <WorkspaceShell
      header={header}
      left={<ConfigRecap examInput={session.examInput} />}
      right={
        <AgentChat
          title="Exam Intent Agent"
          hint="Tell the agent your preferences — question style, topic emphasis, sample questions. It asks one thing at a time and moves on once it has enough to plan the exam."
          turns={turns}
          busy={thinking}
          emptyText="Starting the conversation..."
          placeholder="Type your answer..."
          onSend={(message) => send({ message }, message)}
          footer={
            turns.length > 0 && (
              <div className="flex items-center gap-2 pt-2">
                <Button variant="ghost" disabled={thinking} onClick={() => void send({ action: "skip_question" }, "(Skipped this question)")} className="h-8 px-3 text-xs font-medium text-gray-400 hover:text-white">
                  Skip Question
                </Button>
                <Button variant="ghost" disabled={thinking} onClick={() => void send({ action: "skip_all" }, "(Skipped all remaining questions)")} className="h-8 px-3 text-xs font-medium text-gray-400 hover:text-white">
                  Skip All Questions
                </Button>
              </div>
            )
          }
        />
      }
      footer={
        <Button variant="ghost" onClick={onCancel} className={ghostButton}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Exams
        </Button>
      }
    />
  )
}

// ── Subtopics: blueprint tree + Refinement Agent ───────────────────────────

function BlueprintStage({
  session,
  header,
  sourceLookup,
  onGenerated,
}: {
  session: Session
  header: React.ReactNode
  sourceLookup?: ReturnType<typeof buildSourceLookup>
  onGenerated: () => Promise<void>
}) {
  const api = useApi()
  const [sections, setSections] = useState<BlueprintSection[]>(session.blueprint!.sections)
  const history = useResource<{ history: ChatTurn[] }>(`/api/generation-agents/review/${session.id}`)
  // Turns from this visit, shown after the saved history.
  const [newTurns, setNewTurns] = useState<ChatTurn[]>([])
  const [thinking, setThinking] = useState(false)
  const [generating, setGenerating] = useState(false)
  const sectionsRef = useRef(sections)
  useEffect(() => {
    sectionsRef.current = sections
  }, [sections])

  const send = async (message: string) => {
    setNewTurns((prev) => [...prev, { role: "user", content: message }])
    setThinking(true)
    try {
      // The current tree goes with every turn, so hand edits and chat edits never overwrite each other.
      const result = await api<{ message: string; sections: BlueprintSection[] }>("/api/generation-agents/review/turn", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, message, sections: sectionsRef.current }),
      })
      setNewTurns((prev) => [...prev, { role: "assistant", content: result.message }])
      setSections(result.sections)
      return true
    } catch (err) {
      toast.error((err as Error).message || "Refinement agent turn failed")
      setNewTurns((prev) => prev.slice(0, -1))
      return false
    } finally {
      setThinking(false)
    }
  }

  const generate = async () => {
    if (countBlueprintQuestions(sections) === 0) {
      toast.error("The plan has no questions — add some before generating")
      return
    }
    setGenerating(true)
    try {
      await api("/api/generation-agents/questions/generate", { method: "POST", body: JSON.stringify({ sessionId: session.id, sections }) })
      await onGenerated()
    } catch (err) {
      toast.error((err as Error).message || "Failed to start question generation")
      setGenerating(false)
    }
  }

  return (
    <WorkspaceShell
      header={header}
      left={
        <div className="space-y-4">
          {session.questionsStatus === "failed" && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300" role="alert">
              Generation failed: {session.questionsError ?? "unknown error"}. Adjust the plan if needed and try again.
            </p>
          )}
          <BlueprintTreeViewer title={session.examInput.title || "Untitled Exam"} sections={sections} onChange={setSections} sourceLookup={sourceLookup} />
        </div>
      }
      right={
        <AgentChat
          title="Refinement Agent"
          hint={'Ask for changes in plain language — e.g. "give Arrays 3 more questions".'}
          turns={[...(history.data?.history ?? []), ...newTurns]}
          busy={thinking}
          emptyText="No messages yet — ask for a change."
          placeholder="e.g. Add a subtopic to Arrays..."
          onSend={send}
          className="lg:h-full"
        />
      }
      footer={
        <>
          <span className="text-xs text-gray-500">{countBlueprintQuestions(sections)} questions planned</span>
          <Button onClick={() => void generate()} disabled={generating || thinking} className={primaryButton}>
            <Sparkles className="h-4 w-4 mr-2 text-orange-200" /> Generate Questions
          </Button>
        </>
      }
    />
  )
}

// ── Review: questions + Question Review Agent ──────────────────────────────

function ReviewStage({ session, header }: { session: Session; header: React.ReactNode }) {
  const api = useApi()
  const navigate = useNavigate()
  const [exam, setExam] = useState<GeneratedExam>(session.questions!)
  const history = useResource<{ history: ChatTurn[] }>(`/api/generation-agents/question-review/${session.id}`)
  const [newTurns, setNewTurns] = useState<ChatTurn[]>([])
  const [thinking, setThinking] = useState(false)

  const questionCount = exam.sections.reduce((n, sec) => n + sec.topics.reduce((m, t) => m + t.questions.length, 0), 0)
  const totalMarks = exam.sections.reduce((n, sec) => n + sec.topics.reduce((m, t) => m + t.questions.reduce((k, q) => k + q.marks, 0), 0), 0)

  const send = async (message: string) => {
    setNewTurns((prev) => [...prev, { role: "user", content: message }])
    setThinking(true)
    try {
      const result = await api<{ message: string; done: boolean; questions: GeneratedExam | null }>("/api/generation-agents/question-review/turn", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, message }),
      })
      setNewTurns((prev) => [...prev, { role: "assistant", content: result.message }])
      // The server re-reads the questions after applying edits, so this is always the post-change state.
      if (result.questions) setExam(result.questions)
      if (result.done) toast.success(result.message || "Question review marked complete.")
      return true
    } catch (err) {
      toast.error((err as Error).message || "Could not send that message")
      setNewTurns((prev) => prev.slice(0, -1))
      return false
    } finally {
      setThinking(false)
    }
  }

  const download = () => {
    const data = { title: session.examInput.title || "Untitled Exam", difficulty: session.examInput.difficulty, ...exam }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${(session.examInput.title || "exam").replace(/[^\w-]+/g, "-")}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <WorkspaceShell
      header={header}
      left={<GeneratedQuestionList exam={exam} />}
      right={
        <div className="space-y-4 lg:h-full lg:flex lg:flex-col">
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile label="Sections" value={exam.sections.length} />
            <StatTile label="Questions" value={questionCount} tone="text-orange-300" />
            <StatTile label="Marks" value={totalMarks} tone="text-emerald-400" />
          </div>
          <AgentChat
            title="Question Review Agent"
            hint={'Ask to add, remove, or reword a question, change an MCQ\'s options, or generate 1-3 new questions for a subtopic — type "that\'s all" when you\'re done.'}
            turns={[...(history.data?.history ?? []), ...newTurns]}
            busy={thinking}
            busyText="Working on it..."
            emptyText="Type a change you'd like to make to this exam."
            placeholder="e.g. reword question 3 to be clearer"
            onSend={send}
            className="lg:flex-1 lg:min-h-0"
          />
        </div>
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => navigate("/exams")} className={ghostButton}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Exams
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={download} className="bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 h-10 text-sm font-semibold px-4">
              <Download className="h-4 w-4 mr-2" /> Download JSON
            </Button>
            <Button onClick={() => navigate(`/exams/${session.id}/publish`)} className={primaryButton}>
              <Send className="h-4 w-4 mr-2" /> Continue to Publish
            </Button>
          </div>
        </>
      }
    />
  )
}
