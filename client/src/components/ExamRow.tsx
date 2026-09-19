import { useNavigate } from "react-router"
import { BookOpen, Clock, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRole } from "@/lib/session"
import type { SessionSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

export function examStage(s: SessionSummary): { label: string; tone: string } {
  if (s.status !== "completed") return { label: "Preferences", tone: "bg-white/5 text-gray-300 border-white/10" }
  if (s.blueprintStatus === "failed") return { label: "Planning failed", tone: "bg-red-500/10 text-red-400 border-red-500/30" }
  if (s.blueprintStatus !== "completed") return { label: "Planning", tone: "bg-amber-500/10 text-amber-300 border-amber-500/30" }
  if (s.questionsStatus === "completed") return { label: "Questions ready", tone: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" }
  if (s.questionsStatus === "in_progress") return { label: "Generating", tone: "bg-amber-500/10 text-amber-300 border-amber-500/30" }
  if (s.questionsStatus === "failed") return { label: "Generation failed", tone: "bg-red-500/10 text-red-400 border-red-500/30" }
  return { label: "Plan ready", tone: "bg-orange-500/10 text-orange-300 border-orange-500/30" }
}

export const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })

/** One exam in a list — same row design as Abhyas's "Recent Exams". */
export function ExamRow({ exam }: { exam: SessionSummary }) {
  const navigate = useNavigate()
  const role = useRole()
  const stage = examStage(exam)
  const Icon = exam.bookId ? BookOpen : FileText

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-[#0f0f11] border border-white/5 rounded-xl hover:bg-[#12131a] hover:border-white/10 transition-all">
      <div className="flex items-center gap-4 min-w-0">
        <div className="h-10 w-10 bg-orange-600/20 text-orange-400 rounded-lg flex items-center justify-center border border-orange-500/30 shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm truncate">{exam.title || "Untitled Exam"}</p>
          <p className="text-gray-500 text-xs flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {exam.sectionCount} section{exam.sectionCount === 1 ? "" : "s"} · {exam.bookId ? "From a book" : "AI generated"} · Created {formatDate(exam.createdAt)}
            {role === "admin" && exam.ownerEmail && ` · By ${exam.ownerEmail}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className={cn("text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider border", stage.tone)}>{stage.label}</span>
        <Button
          variant="outline"
          size="sm"
          className="bg-transparent border-orange-500/30 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
          onClick={() => navigate(`/exams/${exam.id}`)}
        >
          {exam.questionsStatus === "completed" ? "Review" : "Continue"}
        </Button>
      </div>
    </div>
  )
}
