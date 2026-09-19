import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { BookToc, Difficulty, ExamInput, QuestionType } from "@/lib/types"
import { cn } from "@/lib/utils"
import { labelClass, selectClass } from "./workspace"

// ── Exam details ─────────────────────────────────────────────────────────────

export type ExamDetails = {
  title: string
  difficulty: Difficulty | ""
  instructions: string[]
}

export const EMPTY_EXAM_DETAILS: ExamDetails = {
  title: "",
  difficulty: "medium",
  instructions: [""],
}

const inputClass = "bg-[#14151f] border border-white/15 text-white placeholder:text-zinc-500 h-11 rounded-lg focus-visible:ring-orange-500/40"
const detailLabelClass = "text-sm font-semibold text-gray-300"

export function ExamDetailsForm({ values, onChange }: { values: ExamDetails; onChange: (patch: Partial<ExamDetails>) => void }) {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-white">Exam details</h2>
        <p className="text-xs text-gray-400 mt-0.5">The AI uses these to pitch questions at the right level.</p>
      </div>

      <label className="block space-y-2">
        <span className={detailLabelClass}>Exam Title</span>
        <Input value={values.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="e.g. Advanced Fluid Dynamics - Midterm" className={inputClass} />
      </label>

      <div className="space-y-2">
        <span className={detailLabelClass} id="difficulty-label">
          Difficulty
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-labelledby="difficulty-label">
          {(["easy", "medium", "hard"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant="outline"
              role="radio"
              aria-checked={values.difficulty === value}
              onClick={() => onChange({ difficulty: value })}
              className={cn(
                "h-11 border-2 font-bold text-sm rounded-xl flex items-center justify-center gap-2.5 capitalize",
                // dark: variants too — the outline button's own dark-mode background would otherwise win.
                values.difficulty === value
                  ? "bg-orange-600 hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-700 text-white border-orange-400 dark:border-orange-400 ring-2 ring-orange-500/30"
                  : "bg-[#14151f] dark:bg-[#14151f] border-white/15 dark:border-white/15 text-zinc-400 hover:bg-[#1a1b2a] dark:hover:bg-[#1a1b2a] hover:text-white",
              )}
            >
              <span className={cn("w-2.5 h-2.5 rounded-full", values.difficulty === value ? "bg-white" : "bg-zinc-600")} />
              {value}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <span className={detailLabelClass}>Exam Instructions</span>
        <p className="text-xs text-gray-500">Guidance for the whole exam, e.g. "use Indian currency in word problems".</p>
        <div className="space-y-2.5">
          {values.instructions.map((inst, idx) => (
            <div key={idx} className="flex gap-2">
              <Input
                value={inst}
                onChange={(e) => onChange({ instructions: values.instructions.map((v, i) => (i === idx ? e.target.value : v)) })}
                placeholder={`Instruction ${idx + 1}`}
                aria-label={`Instruction ${idx + 1}`}
                className={cn(inputClass, "h-10 flex-1")}
              />
              {values.instructions.length > 1 && (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`Remove instruction ${idx + 1}`}
                  onClick={() => onChange({ instructions: values.instructions.filter((_, i) => i !== idx) })}
                  className="bg-transparent border-white/10 text-red-400 hover:bg-red-500/10 h-10 w-10 shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() => onChange({ instructions: [...values.instructions, ""] })}
            className="w-full h-10 bg-transparent border-dashed border-white/10 text-gray-400 hover:text-white hover:bg-white/5"
          >
            <Plus className="h-4 w-4 mr-2" /> Add Instruction
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Sections & topics ────────────────────────────────────────────────────────

export type SectionDraft = {
  id: string
  name: string
  subject: string
  topics: string[]
  questionType: QuestionType
  numberOfQuestions: string
  marksPerQuestion: string
}

export const newSectionDraft = (index: number): SectionDraft => ({
  id: `${Date.now()}-${index}`,
  name: `Section ${String.fromCharCode(65 + index)}`,
  subject: "",
  topics: [""],
  questionType: "mcq",
  numberOfQuestions: "5",
  marksPerQuestion: "1",
})

export function sectionsAreValid(sections: SectionDraft[]) {
  return sections.every(
    (s) => s.name.trim() && s.subject.trim() && s.topics.some((t) => t.trim()) && Number(s.numberOfQuestions) > 0 && Number(s.marksPerQuestion) > 0,
  )
}

export function buildExamInput(details: ExamDetails, sections: SectionDraft[], bookId?: string): ExamInput {
  const instructions = details.instructions.map((i) => i.trim()).filter(Boolean)
  return {
    ...(details.title.trim() && { title: details.title.trim() }),
    ...(details.difficulty && { difficulty: details.difficulty }),
    ...(instructions.length > 0 && { instructions }),
    ...(bookId && { bookId }),
    sections: sections.map((s) => ({
      name: s.name.trim(),
      subject: s.subject.trim(),
      question_type: s.questionType,
      question_count: Number(s.numberOfQuestions),
      marks: Number(s.marksPerQuestion),
      topics: [...new Set(s.topics.map((t) => t.trim()).filter(Boolean))],
    })),
  }
}

export function SectionsConfigForm({ sections, onChange }: { sections: SectionDraft[]; onChange: (sections: SectionDraft[]) => void }) {
  const updateSection = (id: string, patch: Partial<SectionDraft>) => onChange(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  return (
    <div className="bg-[#0f0f11] border border-white/10 rounded-2xl p-5 space-y-5 shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div>
          <h2 className="font-bold text-white text-base tracking-wider uppercase">Sections & Topics</h2>
          <p className="text-xs text-gray-400">Each section is one subject and question type. Subtopics are planned from these topics.</p>
        </div>
        <Button
          type="button"
          onClick={() => onChange([...sections, newSectionDraft(sections.length)])}
          size="sm"
          className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-orange-950/40 h-9 px-4 shrink-0"
        >
          <Plus className="h-4 w-4 mr-1.5" /> Add Section
        </Button>
      </div>

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.id} className="bg-[#09090b] border border-white/10 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-3">
              <Input
                value={section.name}
                onChange={(e) => updateSection(section.id, { name: e.target.value })}
                className="bg-transparent border-none shadow-none text-white text-base font-bold h-8 p-0"
                placeholder="Section Name"
                aria-label="Section name"
              />
              {sections.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onChange(sections.filter((s) => s.id !== section.id))}
                  className="bg-transparent border-red-500/20 text-red-400 hover:bg-red-500/10 h-8 px-2.5 text-xs font-semibold shrink-0"
                >
                  Remove
                </Button>
              )}
            </div>

            <label className="block space-y-1">
              <span className={labelClass}>Subject</span>
              <Input
                value={section.subject}
                onChange={(e) => updateSection(section.id, { subject: e.target.value })}
                placeholder="Subject (e.g. JavaScript)"
                className="bg-[#14151f] border border-white/15 text-white text-xs font-bold h-8 w-full rounded-lg"
              />
            </label>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className={labelClass}>Topics</span>
                <Button
                  type="button"
                  onClick={() => updateSection(section.id, { topics: [...section.topics, ""] })}
                  className="h-8 px-4 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg"
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Topic
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {section.topics.map((topic, tIdx) => (
                  <div key={tIdx} className="flex items-center gap-2">
                    <Input
                      value={topic}
                      onChange={(e) => updateSection(section.id, { topics: section.topics.map((t, i) => (i === tIdx ? e.target.value : t)) })}
                      placeholder={`Topic ${tIdx + 1}`}
                      aria-label={`${section.name} topic ${tIdx + 1}`}
                      className="bg-[#14151f] border border-white/15 text-white placeholder:text-zinc-400 h-8 text-xs rounded-lg flex-1"
                    />
                    {section.topics.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove topic ${tIdx + 1}`}
                        onClick={() => updateSection(section.id, { topics: section.topics.filter((_, i) => i !== tIdx) })}
                        className="text-gray-400 hover:text-red-400 transition-colors p-1 shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className={labelClass}>Type</span>
                <select
                  value={section.questionType}
                  onChange={(e) => updateSection(section.id, { questionType: e.target.value as QuestionType })}
                  className={cn(selectClass, "h-8 text-xs font-semibold")}
                >
                  <option value="mcq">MCQ</option>
                  <option value="descriptive">Descriptive</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className={labelClass}>Questions</span>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={section.numberOfQuestions}
                  onChange={(e) => updateSection(section.id, { numberOfQuestions: e.target.value })}
                  className="bg-[#14151f] border border-white/15 text-white h-8 text-xs font-bold rounded-lg text-center px-2"
                />
              </label>
              <label className="space-y-1">
                <span className={labelClass}>Marks each</span>
                <Input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={section.marksPerQuestion}
                  onChange={(e) => updateSection(section.id, { marksPerQuestion: e.target.value })}
                  className="bg-[#14151f] border border-white/15 text-white h-8 text-xs font-bold rounded-lg text-center px-2"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ExamSummaryCard({ sections }: { sections: { questionCount: number; marksEach: number }[] }) {
  const questions = sections.reduce((n, s) => n + (s.questionCount || 0), 0)
  const marks = sections.reduce((n, s) => n + (s.questionCount || 0) * (s.marksEach || 0), 0)
  return (
    <Card className="bg-[#0f0f11] border border-white/10 ring-0 rounded-2xl p-5 space-y-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <h3 className="font-bold text-white text-xs tracking-wider uppercase">Exam Summary</h3>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20">Live Stats</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3 rounded-xl bg-[#14151f] border border-white/5 text-center space-y-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Sections</span>
          <span className="text-lg font-extrabold text-white tabular-nums">{sections.length}</span>
        </div>
        <div className="p-3 rounded-xl bg-[#14151f] border border-white/5 text-center space-y-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Questions</span>
          <span className="text-lg font-extrabold text-orange-400 tabular-nums">{questions}</span>
        </div>
      </div>
      <div className="p-3 rounded-xl bg-[#14151f] border border-white/5 text-center space-y-1">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Marks</span>
        <span className="text-lg font-extrabold text-emerald-400 tabular-nums">{marks}</span>
      </div>
    </Card>
  )
}

/** "From Source" helper: click a chapter or section heading to add it as a topic. */
export function BookGuide({ title, toc, onPick }: { title: string; toc: BookToc; onPick: (heading: string) => void }) {
  return (
    <div className="bg-[#0f0f11] border border-white/10 rounded-2xl p-4 space-y-3">
      <div>
        <h3 className="font-bold text-white text-xs tracking-wider uppercase">From this book</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">{title}. Click a heading to add it as a topic.</p>
      </div>
      <div className="space-y-2.5 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
        {toc.chapters.map((chapter) => (
          <div key={chapter.id} className="space-y-1.5">
            <button type="button" onClick={() => onPick(chapter.title)} className="w-full text-left text-xs font-semibold text-gray-100 hover:text-orange-300 transition-colors">
              {chapter.title}
            </button>
            <div className="flex flex-wrap gap-1.5 pl-2">
              {chapter.sections
                .filter((section) => !section.headingGenerated)
                .map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => onPick(section.heading)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-gray-300 hover:border-orange-500/40 hover:text-orange-200 transition-colors"
                  >
                    {section.heading}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Shown beside the intent chat so the teacher can see what the agent is planning from. */
export function ConfigRecap({ examInput }: { examInput: ExamInput }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-bold text-white text-base tracking-wide">Your sections</h2>
        <p className="text-xs text-gray-400">Answer the agent in the panel on the right. Once it has enough, the subtopic plan appears here.</p>
      </div>
      {examInput.sections.map((s) => (
        <div key={s.name} className="bg-[#0f0f11] border border-white/10 rounded-xl p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-bold text-white text-sm">{s.name}</span>
            <span className="text-[11px] text-gray-400 uppercase tracking-wider">
              {s.question_type === "mcq" ? "MCQ" : "Descriptive"} · {s.question_count} Q · {s.marks} mark(s) each
            </span>
          </div>
          <p className="text-xs text-gray-300">{s.subject}</p>
          <div className="flex flex-wrap gap-1.5">
            {s.topics.map((t) => {
              const name = typeof t === "string" ? t : t.topic
              return (
                <span key={name} className="text-[11px] px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-200">
                  {name}
                </span>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
