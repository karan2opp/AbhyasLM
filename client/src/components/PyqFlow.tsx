import { useMemo, useState, type ReactNode } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, Download, FileText, Plus, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useApi } from "@/lib/api"
import { useResource } from "@/lib/hooks"
import type { PaperDocument, QuestionType, RetrievedQuestion, RetrievedTopicGroup } from "@/lib/types"
import { cn } from "@/lib/utils"
import { UploadPanel } from "./UploadPanel"
import { GeneratingLoader, LoadingRow, StatTile, fieldClass, ghostButton, primaryButton, selectClass } from "./workspace"

export type PyqStage = "papers" | "settings" | "preview"
type TopicTier = "high" | "mid" | "low"
export type WorkspaceParts = { left: ReactNode; right: ReactNode; footer: ReactNode }

const TIERS: { id: TopicTier; label: string; hint: string }[] = [
  { id: "high", label: "High priority", hint: "Gets the most questions" },
  { id: "mid", label: "Mid priority", hint: "A moderate share" },
  { id: "low", label: "Low priority", hint: "A few questions" },
]

const MCQ_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"]
const isWorking = (d: PaperDocument) => d.status === "pending" || d.status === "processing"

function TierInput({ tier, topics, onAdd, onRemove }: { tier: (typeof TIERS)[number]; topics: string[]; onAdd: (t: string) => void; onRemove: (t: string) => void }) {
  const [value, setValue] = useState("")
  const submit = () => {
    const t = value.trim()
    if (!t) return
    onAdd(t)
    setValue("")
  }
  return (
    <div className="bg-[#09090b] border border-white/10 rounded-xl p-3 space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">{tier.label}</span>
        <span className="text-[11px] text-gray-500">{tier.hint}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 min-h-[24px]">
        {topics.length === 0 && <span className="text-[11px] italic text-gray-500">No topics yet</span>}
        {topics.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs bg-orange-500/10 border border-orange-500/25 text-orange-200">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onRemove(t)} className="hover:text-white">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Type a topic and press Enter"
          aria-label={`${tier.label} topic`}
          className={cn(fieldClass, "flex-1")}
        />
        <Button type="button" variant="outline" onClick={submit} className="h-9 bg-transparent border-white/15 text-gray-200 hover:bg-white/5">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
    </div>
  )
}

function RetrievedQuestionCard({ q, index, documentTitle, removed, onToggle }: { q: RetrievedQuestion; index: number; documentTitle: string; removed: boolean; onToggle: () => void }) {
  return (
    <div className={cn("rounded-xl border p-4 text-sm transition-opacity", removed ? "border-white/5 opacity-40" : "border-white/10 bg-[#0f0f11]")}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-gray-100 whitespace-pre-wrap">
          <span className="text-orange-400 font-mono text-xs mr-2">Q{index + 1}</span>
          {q.question_text}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-gray-400">{q.marks} marks</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggle}
            aria-pressed={!removed}
            className={cn("h-7 px-2 text-[11px] bg-transparent", removed ? "border-white/15 text-gray-300 hover:bg-white/5" : "border-red-500/25 text-red-300 hover:bg-red-500/10")}
          >
            {removed ? "Keep" : "Remove"}
          </Button>
        </div>
      </div>
      {q.type === "mcq" && q.options && (
        <ul className="mt-2.5 grid gap-1 text-xs">
          {q.options.map((opt, oi) => {
            const isCorrect = MCQ_LETTERS[oi] === q.correct_option
            return (
              <li key={oi} className={cn("text-gray-300", isCorrect && "font-semibold text-emerald-400")}>
                {MCQ_LETTERS[oi]}. {opt} {isCorrect && <span aria-label="correct answer">✓</span>}
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
        <span>
          from {documentTitle}
          {q.source.questionNumber ? ` · Q${q.source.questionNumber}` : ""} · page {q.source.pageStart}
        </span>
        {q.type === "mcq" && !q.correct_option && (
          <span className="inline-flex items-center gap-1 text-amber-400">
            <AlertTriangle className="h-3 w-3" /> No answer key in the paper
          </span>
        )}
      </div>
    </div>
  )
}

export function PyqFlow({
  examTitle,
  onBack,
  renderShell,
  onStageChange,
}: {
  examTitle: string
  onBack: () => void
  renderShell: (parts: WorkspaceParts) => ReactNode
  onStageChange: (stage: PyqStage) => void
}) {
  const api = useApi()
  const docs = useResource<PaperDocument[]>("/api/question-bank/documents", (list) => (list.some(isWorking) ? 4000 : null))
  const documents = useMemo(() => docs.data ?? [], [docs.data])

  const [stage, setStageState] = useState<PyqStage>("papers")
  const setStage = (next: PyqStage) => {
    setStageState(next)
    onStageChange(next)
  }
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [tiers, setTiers] = useState<Record<TopicTier, string[]>>({ high: [], mid: [], low: [] })
  const [questionType, setQuestionType] = useState<QuestionType>("mcq")
  const [marks, setMarks] = useState("2")
  const [questionCount, setQuestionCount] = useState("10")

  const [isRetrieving, setIsRetrieving] = useState(false)
  const [results, setResults] = useState<RetrievedTopicGroup[] | null>(null)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())

  const documentTitles = useMemo(() => Object.fromEntries(documents.map((d) => [d.id, d.title])), [documents])
  const selectedDocs = documents.filter((d) => selectedDocIds.includes(d.id))
  const allTopics = [...tiers.high, ...tiers.mid, ...tiers.low]
  const keptGroups = (results ?? []).map((g) => ({ ...g, questions: g.questions.filter((q) => !removedIds.has(q.id)) }))
  const keptQuestions = keptGroups.flatMap((g) => g.questions)
  const keptMarks = keptQuestions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0)

  const toggleDocument = (id: string) => setSelectedDocIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))

  const handleRetrieve = async () => {
    if (allTopics.length === 0) {
      toast.error("Add at least one topic")
      return
    }
    const count = Number(questionCount)
    const marksEach = Number(marks)
    if (!count || count < 1 || count > 50) {
      toast.error("Total questions must be between 1 and 50")
      return
    }
    if (!marksEach || marksEach <= 0) {
      toast.error("Marks per question must be more than 0")
      return
    }

    setIsRetrieving(true)
    setStage("preview")
    try {
      const { groups } = await api<{ groups: RetrievedTopicGroup[] }>("/api/question-bank/generate", {
        method: "POST",
        body: JSON.stringify({ documentIds: selectedDocIds, topics: tiers, difficulty: "medium", questionCount: count, questionType, marks: marksEach }),
      })
      setResults(groups)
      setRemovedIds(new Set())
    } catch (err) {
      toast.error((err as Error).message || "Could not retrieve questions")
      setStage("settings")
    } finally {
      setIsRetrieving(false)
    }
  }

  const handleDownload = () => {
    const data = {
      title: examTitle || "Past paper questions",
      sections: keptGroups
        .filter((g) => g.questions.length > 0)
        .map((g) => ({ topic: g.topic, priority: g.tier, questions: g.questions })),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${(examTitle || "pyq-questions").replace(/[^\w-]+/g, "-")}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${keptQuestions.length} question(s) downloaded`)
  }

  if (stage === "papers") {
    const left = (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">Choose past papers</h2>
          <p className="text-xs text-gray-400 mt-0.5">Questions will only be taken from the papers you tick. Upload new ones from the panel on the right.</p>
        </div>
        {docs.loading ? (
          <LoadingRow label="Loading papers..." />
        ) : documents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-10 text-center space-y-2">
            <FileText className="h-8 w-8 text-gray-600 mx-auto" />
            <p className="text-sm text-gray-300 font-semibold">No papers yet</p>
            <p className="text-xs text-gray-500">Upload a past paper PDF from the panel on the right to get started.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {documents.map((doc) => {
              const ready = doc.status === "completed"
              const checked = selectedDocIds.includes(doc.id)
              return (
                <label
                  key={doc.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3.5 transition-colors",
                    ready ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                    checked ? "border-orange-500/50 bg-orange-500/5" : "border-white/10 bg-[#0f0f11] hover:bg-[#15151a]",
                  )}
                >
                  <input type="checkbox" disabled={!ready} checked={checked} onChange={() => toggleDocument(doc.id)} className="h-4 w-4 accent-orange-500" />
                  <FileText className="h-4 w-4 text-gray-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{doc.title}</p>
                    {doc.status === "failed" && doc.error && <p className="text-[11px] text-red-400 truncate">{doc.error}</p>}
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-semibold shrink-0",
                      ready && "text-gray-400",
                      isWorking(doc) && "text-amber-400",
                      doc.status === "failed" && "text-red-400",
                    )}
                  >
                    {ready ? `${doc.totalChunks} questions` : doc.status === "failed" ? "Failed" : "Processing..."}
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>
    )

    const right = (
      <div className="space-y-4">
        <UploadPanel
          heading="Upload a paper"
          endpoint="/api/question-bank/documents"
          buttonText="Upload"
          successText="Paper uploaded. It will be ready to select once processing finishes."
          onUploaded={() => docs.reload()}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile label="Selected" value={selectedDocIds.length} tone="text-orange-300" />
          <StatTile label="Questions" value={selectedDocs.reduce((n, d) => n + d.totalChunks, 0)} tone="text-amber-300" />
        </div>
      </div>
    )

    const footer = (
      <>
        <Button variant="ghost" onClick={onBack} className={ghostButton}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Previous
        </Button>
        <Button onClick={() => (selectedDocIds.length === 0 ? toast.error("Select at least one paper") : setStage("settings"))} className={primaryButton}>
          Next <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </>
    )

    return renderShell({ left, right, footer })
  }

  if (stage === "settings") {
    const left = (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-bold text-white">Topics and question settings</h2>
          <p className="text-xs text-gray-400 mt-0.5">Questions are shared out by priority, so high-priority topics get the most.</p>
        </div>
        <div className="grid gap-3">
          {TIERS.map((tier) => (
            <TierInput
              key={tier.id}
              tier={tier}
              topics={tiers[tier.id]}
              onAdd={(t) => setTiers((prev) => (prev[tier.id].includes(t) ? prev : { ...prev, [tier.id]: [...prev[tier.id], t] }))}
              onRemove={(t) => setTiers((prev) => ({ ...prev, [tier.id]: prev[tier.id].filter((x) => x !== t) }))}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block">Type</span>
            <select value={questionType} onChange={(e) => setQuestionType(e.target.value as QuestionType)} className={selectClass}>
              <option value="mcq">MCQ</option>
              <option value="descriptive">Descriptive</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block">Marks each</span>
            <Input type="number" min={0.5} step={0.5} value={marks} onChange={(e) => setMarks(e.target.value)} className={fieldClass} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block">Total questions</span>
            <Input type="number" min={1} max={50} value={questionCount} onChange={(e) => setQuestionCount(e.target.value)} className={fieldClass} />
          </label>
        </div>
      </div>
    )

    const right = (
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-[#0f0f11] p-4 space-y-2">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Drawing from</h3>
          <ul className="space-y-1.5">
            {selectedDocs.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-xs text-gray-200">
                <FileText className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                <span className="truncate">{d.title}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile label="Topics" value={allTopics.length} tone="text-orange-300" />
          <StatTile label="Questions" value={Number(questionCount) || 0} tone="text-amber-300" />
        </div>
        <StatTile label="Total marks" value={(Number(questionCount) || 0) * (Number(marks) || 0)} tone="text-emerald-400" />
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Questions are taken word for word from the papers. If the papers don&apos;t have enough for a topic, you&apos;ll get fewer than requested.
        </p>
      </div>
    )

    const footer = (
      <>
        <Button variant="ghost" onClick={() => setStage("papers")} className={ghostButton}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Previous
        </Button>
        <Button onClick={() => void handleRetrieve()} className={primaryButton}>
          <Sparkles className="h-4 w-4 mr-2" /> Find Questions
        </Button>
      </>
    )

    return renderShell({ left, right, footer })
  }

  const left = isRetrieving ? (
    <GeneratingLoader title="Finding matching questions..." />
  ) : (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">Preview questions</h2>
        <p className="text-xs text-gray-400 mt-0.5">Remove any you don&apos;t want. The rest are downloaded exactly as shown.</p>
      </div>
      {(results ?? []).map((group) => (
        <div key={`${group.tier}-${group.topic}`} className="space-y-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-white">
              {group.topic}
              <span className="ml-2 text-[11px] font-semibold text-gray-500 uppercase">{group.tier} priority</span>
            </h3>
            <span className="text-[11px] text-gray-400">
              {group.questions.length} of {group.allocatedQuestions} found
            </span>
          </div>
          {group.questions.length === 0 ? (
            <p className="text-xs italic text-gray-500 rounded-xl border border-dashed border-white/10 p-4">The selected papers had no questions matching this topic.</p>
          ) : (
            group.questions.map((q, i) => (
              <RetrievedQuestionCard
                key={q.id}
                q={q}
                index={i}
                documentTitle={documentTitles[q.source.documentId] ?? "source paper"}
                removed={removedIds.has(q.id)}
                onToggle={() =>
                  setRemovedIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(q.id)) next.delete(q.id)
                    else next.add(q.id)
                    return next
                  })
                }
              />
            ))
          )}
        </div>
      ))}
    </div>
  )

  const right = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="Keeping" value={keptQuestions.length} tone="text-orange-300" />
        <StatTile label="Removed" value={removedIds.size} tone="text-gray-300" />
      </div>
      <StatTile label="Total marks" value={keptMarks} tone="text-emerald-400" />
      <p className="text-[11px] text-gray-500 leading-relaxed">The download is a JSON file with each question, its options and answer key, and the page it came from.</p>
    </div>
  )

  const footer = (
    <>
      <Button variant="ghost" disabled={isRetrieving} onClick={() => setStage("settings")} className={ghostButton}>
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Previous
      </Button>
      <Button onClick={handleDownload} disabled={isRetrieving || keptQuestions.length === 0} className={primaryButton}>
        <Download className="h-4 w-4 mr-2" /> Download {keptQuestions.length} Question{keptQuestions.length === 1 ? "" : "s"}
      </Button>
    </>
  )

  return renderShell({ left, right, footer })
}
