import type { ElementType, ReactNode } from "react"
import { BookOpen, Check, Library, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export type CreationMode = "ai" | "pyq" | "source"

export const MODES: { id: CreationMode; label: string; description: string; icon: ElementType }[] = [
  {
    id: "ai",
    label: "AI Generated Questions",
    description: "Enter subjects and topics, talk through your preferences, and AI writes a fresh set of questions.",
    icon: Sparkles,
  },
  {
    id: "pyq",
    label: "From PYQ",
    description: "Pick uploaded past papers and pull matching questions exactly as they appeared.",
    icon: Library,
  },
  {
    id: "source",
    label: "From Source",
    description: "Pick an indexed textbook. Topics are matched to its chapters and AI writes new questions from its text.",
    icon: BookOpen,
  },
]

export const STEPS: Record<CreationMode, string[]> = {
  ai: ["Details", "Topics", "Preferences", "Subtopics", "Generate", "Review", "Publish"],
  pyq: ["Details", "Papers", "Settings", "Preview"],
  source: ["Details", "Book", "Topics", "Preferences", "Subtopics", "Generate", "Review", "Publish"],
}

export const primaryButton = "bg-orange-600 hover:bg-orange-700 text-white h-10 px-6 font-bold text-sm rounded-xl shadow-lg shadow-orange-950/40"
export const ghostButton = "text-gray-400 hover:text-white h-10 px-4 text-sm font-semibold"
export const fieldClass = "bg-[#14151f] border border-white/15 text-white placeholder:text-zinc-500 h-9 text-sm rounded-lg"
export const selectClass =
  "w-full bg-[#14151f] border border-white/15 text-white h-9 rounded-lg px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50"
export const labelClass = "text-[11px] font-bold text-gray-300 uppercase tracking-wider block"

export function WorkspaceShell({ header, left, right, footer }: { header?: ReactNode; left: ReactNode; right: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row lg:h-full lg:min-h-0 rounded-2xl border border-white/10 bg-[#070708] lg:overflow-hidden">
      <section className="flex-1 min-w-0 flex flex-col lg:min-h-0">
        {header && <div className="shrink-0 px-5 pt-4 pb-3 border-b border-white/5">{header}</div>}
        <div className="flex-1 lg:overflow-y-auto custom-scrollbar px-5 py-5">{left}</div>
        {footer && (
          <div className="shrink-0 sticky bottom-0 lg:static z-30 border-t border-white/10 bg-[#050505]/95 backdrop-blur-xl px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            {footer}
          </div>
        )}
      </section>
      <aside className="w-full lg:w-[380px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0a0a0c] lg:overflow-y-auto custom-scrollbar p-4">
        {right}
      </aside>
    </div>
  )
}

export function WizardHeader({ mode, currentStep, onChangeMode }: { mode: CreationMode; currentStep: number; onChangeMode?: () => void }) {
  const modeInfo = MODES.find((m) => m.id === mode)!
  const Icon = modeInfo.icon
  const steps = STEPS[mode]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Icon className="h-4 w-4 text-orange-400" />
          {modeInfo.label}
        </div>
        {onChangeMode && (
          <button onClick={onChangeMode} className="text-xs font-semibold text-gray-400 hover:text-orange-300 transition-colors">
            Change mode
          </button>
        )}
      </div>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {steps.map((label, i) => {
          const done = i < currentStep
          const active = i === currentStep
          return (
            <li key={label} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  active && "border-orange-500/60 bg-orange-500/10 text-orange-300",
                  done && "border-white/15 bg-white/5 text-gray-300",
                  !active && !done && "border-white/5 text-gray-500",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : <span className="tabular-nums">{i + 1}</span>}
                {label}
              </span>
              {i < steps.length - 1 && <span className="h-px w-3 bg-white/10" />}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function ModePicker({ selected, onSelect }: { selected: CreationMode | null; onSelect: (mode: CreationMode) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-white">How do you want to build this exam?</h3>
        <p className="text-xs text-gray-400 mt-0.5">You can change this until questions are created.</p>
      </div>
      {MODES.map((m) => {
        const Icon = m.icon
        const isSelected = selected === m.id
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            aria-pressed={isSelected}
            className={cn(
              "w-full text-left rounded-xl border p-4 transition-all",
              isSelected ? "border-orange-500/60 bg-orange-500/10 ring-1 ring-orange-500/30" : "border-white/10 bg-[#0f0f11] hover:border-orange-500/40 hover:bg-[#15151a]",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-bold text-white">
              <Icon className="h-4 w-4 text-orange-400" />
              {m.label}
            </span>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{m.description}</p>
          </button>
        )
      })}
    </div>
  )
}

export function StatTile({ label, value, tone = "text-white" }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="p-3 rounded-xl bg-[#14151f] border border-white/5 text-center space-y-1">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">{label}</span>
      <span className={cn("text-lg font-extrabold tabular-nums", tone)}>{value}</span>
    </div>
  )
}

export function GeneratingLoader({ title, progress, message }: { title: string; progress?: { done: number; total: number } | null; message?: string }) {
  const pct = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : null
  return (
    <div className="flex flex-col items-center justify-center py-24 space-y-5" role="status" aria-live="polite">
      <div className="w-16 h-16 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin motion-reduce:animate-[spin_3s_linear_infinite]" />
      <h4 className="text-lg font-bold text-white">{title}</h4>
      {message && <p className="text-xs text-gray-400 text-center max-w-sm">{message}</p>}
      {progress && pct !== null && (
        <div className="w-full max-w-xs space-y-1.5">
          <div className="w-full bg-[#14151f] border border-white/10 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-orange-600 to-amber-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-orange-300 font-semibold text-center tabular-nums">
            {Math.min(progress.done, progress.total)} / {progress.total}
          </p>
        </div>
      )}
    </div>
  )
}

export function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-400 py-10 justify-center" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  )
}

/** Page header used on the list pages (dashboard, exams, question bank, books). */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">{title}</h1>
        {description && <p className="text-gray-400 mt-1 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  )
}
