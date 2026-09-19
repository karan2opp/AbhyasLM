import { useState, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { ArrowLeft, ArrowRight, Loader2, MousePointerClick } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { BookPicker, isBookWorking } from "@/components/BookPicker"
import {
  BookGuide,
  EMPTY_EXAM_DETAILS,
  ExamDetailsForm,
  ExamSummaryCard,
  SectionsConfigForm,
  buildExamInput,
  newSectionDraft,
  sectionsAreValid,
  type ExamDetails,
  type SectionDraft,
} from "@/components/ExamForms"
import { PyqFlow, type PyqStage, type WorkspaceParts } from "@/components/PyqFlow"
import { UploadPanel } from "@/components/UploadPanel"
import { MODES, ModePicker, STEPS, StatTile, WizardHeader, WorkspaceShell, ghostButton, primaryButton, type CreationMode } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useResource } from "@/lib/hooks"
import type { Book, BookSummary, IntentTurnResult } from "@/lib/types"

type Phase = "details" | "build"
const PYQ_STAGE_STEP: Record<PyqStage, number> = { papers: 1, settings: 2, preview: 3 }

export default function NewExam() {
  const api = useApi()
  const navigate = useNavigate()

  const [mode, setMode] = useState<CreationMode | null>(null)
  const [phase, setPhase] = useState<Phase>("details")
  const [details, setDetails] = useState<ExamDetails>(EMPTY_EXAM_DETAILS)
  const [sections, setSections] = useState<SectionDraft[]>([newSectionDraft(0)])
  const [pyqStep, setPyqStep] = useState(1)

  // From Source: the picked book, and its index once opened.
  const books = useResource<BookSummary[]>(mode === "source" ? "/api/books" : null, (list) => (list.some(isBookWorking) ? 5000 : null))
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [sourceBook, setSourceBook] = useState<Book | null>(null)
  const [opening, setOpening] = useState(false)
  const [starting, setStarting] = useState(false)

  const handleDetailsNext = () => {
    if (!details.title.trim()) {
      toast.error("Please enter an exam title")
      return
    }
    setPhase("build")
  }

  const openBook = async () => {
    const book = (books.data ?? []).find((b) => b.id === selectedBookId)
    if (!book) return toast.error("Select a book")
    if (book.status !== "completed") return toast.error("This book is still being indexed")
    setOpening(true)
    try {
      const full = await api<Book>(`/api/books/${book.id}`)
      if (!full.toc) throw new Error("This book has no index yet")
      setSourceBook(full)
    } catch (err) {
      toast.error((err as Error).message || "Could not open the book")
    } finally {
      setOpening(false)
    }
  }

  // Creates the generation session; the rest of the flow (preferences → subtopics → questions → review) lives on the exam page.
  const startExam = async () => {
    if (!sectionsAreValid(sections)) {
      toast.error("Please fill in each section's subject, topics, question count and marks")
      return
    }
    setStarting(true)
    try {
      const examInput = buildExamInput(details, sections, mode === "source" ? sourceBook?.id : undefined)
      const result = await api<IntentTurnResult>("/api/generation-agents/conversation", { method: "POST", body: JSON.stringify({ examInput }) })
      navigate(`/exams/${result.sessionId}`)
    } catch (err) {
      toast.error((err as Error).message || "Failed to start the exam intent conversation")
      setStarting(false)
    }
  }

  const addTopicFromBook = (text: string) =>
    setSections((prev) => {
      const last = prev[prev.length - 1]!
      if (last.topics.some((t) => t.trim() === text)) return prev
      const emptyIndex = last.topics.findIndex((t) => t.trim() === "")
      const topics = emptyIndex >= 0 ? last.topics.map((t, i) => (i === emptyIndex ? text : t)) : [...last.topics, text]
      return [...prev.slice(0, -1), { ...last, topics }]
    })

  const changeMode = () => {
    if (phase === "build" && !confirm("Switching mode discards what you've set up in this mode so far. Continue?")) return
    setMode(null)
    setPhase("details")
    setSourceBook(null)
    setSelectedBookId(null)
    setPyqStep(1)
  }

  let content: ReactNode

  if (!mode) {
    content = (
      <WorkspaceShell
        left={
          <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center gap-3 px-6">
            <div className="h-12 w-12 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center">
              <MousePointerClick className="h-6 w-6 text-orange-400" />
            </div>
            <h2 className="text-lg font-bold text-white">Create a new exam</h2>
            <p className="text-sm text-gray-400 max-w-sm">Choose how you want to build it. The exam details form opens here once you pick a mode.</p>
          </div>
        }
        right={<ModePicker selected={null} onSelect={setMode} />}
      />
    )
  } else if (phase === "details") {
    const modeInfo = MODES.find((m) => m.id === mode)!
    const ModeIcon = modeInfo.icon
    content = (
      <WorkspaceShell
        header={<WizardHeader mode={mode} currentStep={0} />}
        left={<ExamDetailsForm values={details} onChange={(patch) => setDetails((prev) => ({ ...prev, ...patch }))} />}
        right={
          <div className="space-y-4">
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-bold text-white">
                  <ModeIcon className="h-4 w-4 text-orange-400" /> {modeInfo.label}
                </span>
                <button onClick={changeMode} className="text-xs font-semibold text-gray-400 hover:text-orange-300">
                  Change mode
                </button>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{modeInfo.description}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0f0f11] p-4 space-y-2.5">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">What happens next</h3>
              <ol className="space-y-2">
                {STEPS[mode].map((step, i) => (
                  <li key={step} className="flex items-center gap-2.5 text-xs text-gray-300">
                    <span className="h-5 w-5 rounded-full border border-white/15 flex items-center justify-center text-[10px] tabular-nums text-gray-400">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        }
        footer={
          <>
            <span className="text-xs text-gray-500">Nothing is saved until the AI conversation starts</span>
            <Button onClick={handleDetailsNext} className={primaryButton}>
              Next <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </>
        }
      />
    )
  } else if (mode === "pyq") {
    const renderShell = (parts: WorkspaceParts) => (
      <WorkspaceShell header={<WizardHeader mode="pyq" currentStep={pyqStep} onChangeMode={changeMode} />} left={parts.left} right={parts.right} footer={parts.footer} />
    )
    content = <PyqFlow examTitle={details.title} onBack={() => setPhase("details")} renderShell={renderShell} onStageChange={(stage) => setPyqStep(PYQ_STAGE_STEP[stage])} />
  } else if (mode === "source" && !sourceBook) {
    const list = books.data ?? []
    const selected = list.find((b) => b.id === selectedBookId) ?? null
    content = (
      <WorkspaceShell
        header={<WizardHeader mode="source" currentStep={1} onChangeMode={changeMode} />}
        left={<BookPicker books={list} loading={books.loading} selectedId={selectedBookId} onSelect={setSelectedBookId} />}
        right={
          <div className="space-y-4">
            <UploadPanel<{ bookId: string }>
              heading="Upload a book"
              endpoint="/api/books"
              buttonText="Upload and index"
              hint="PDFs with selectable text only. Scanned books aren't supported yet."
              successText="Book uploaded. Indexing has started and can take a few minutes for a long book."
              onUploaded={async ({ bookId }) => {
                setSelectedBookId(bookId)
                await books.reload()
              }}
            />
            {selected && (
              <div className="grid grid-cols-2 gap-2.5">
                <StatTile label="Pages" value={selected.pageCount ?? "–"} />
                <StatTile
                  label="Status"
                  value={selected.status === "completed" ? "Ready" : selected.status === "failed" ? "Failed" : "Indexing"}
                  tone={selected.status === "completed" ? "text-emerald-400" : "text-amber-300"}
                />
              </div>
            )}
          </div>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPhase("details")} className={ghostButton}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Previous
            </Button>
            <Button onClick={() => void openBook()} disabled={opening || !selected || selected.status !== "completed"} className={primaryButton}>
              {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Next <ArrowRight className="h-4 w-4 ml-2" /></>}
            </Button>
          </>
        }
      />
    )
  } else {
    content = (
      <WorkspaceShell
        header={<WizardHeader mode={mode} currentStep={mode === "source" ? 2 : 1} onChangeMode={changeMode} />}
        left={<SectionsConfigForm sections={sections} onChange={setSections} />}
        right={
          <div className="space-y-4">
            {sourceBook?.toc && <BookGuide title={sourceBook.title} toc={sourceBook.toc} onPick={addTopicFromBook} />}
            <ExamSummaryCard sections={sections.map((s) => ({ questionCount: Number(s.numberOfQuestions), marksEach: Number(s.marksPerQuestion) }))} />
          </div>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => (mode === "source" ? setSourceBook(null) : setPhase("details"))} className={ghostButton}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Previous
            </Button>
            <Button onClick={() => void startExam()} disabled={starting} className={primaryButton}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Next <ArrowRight className="h-4 w-4 ml-2" /></>}
            </Button>
          </>
        }
      />
    )
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-3 lg:h-full lg:min-h-0">
      <h1 className="text-base font-bold text-white tracking-tight shrink-0">New Exam{details.title.trim() && phase === "build" ? `: ${details.title.trim()}` : ""}</h1>
      <div className="flex-1 lg:min-h-0">{content}</div>
    </div>
  )
}
