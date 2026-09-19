import { useNavigate } from "react-router"
import { FileText, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ExamRow } from "@/components/ExamRow"
import { LoadingRow, PageHeader } from "@/components/workspace"
import { useResource } from "@/lib/hooks"
import type { SessionSummary } from "@/lib/types"

export default function Exams() {
  const navigate = useNavigate()
  const sessions = useResource<SessionSummary[]>("/api/generation-agents/sessions")
  const exams = sessions.data ?? []

  return (
    <div className="p-6 md:p-10 flex flex-col gap-8">
      <PageHeader
        title="Exams"
        description="Every exam you've started, from preferences through to reviewed questions. Pick one up where you left off."
        actions={
          <Button onClick={() => navigate("/exams/new")} className="bg-orange-600 hover:bg-orange-700 text-white h-10 px-5 font-semibold rounded-xl shadow-lg shadow-orange-950/40">
            <Plus className="h-4 w-4 mr-1.5" /> Create New Exam
          </Button>
        }
      />

      {sessions.error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300" role="alert">
          {sessions.error}
        </p>
      )}

      {sessions.loading ? (
        <LoadingRow label="Loading exams..." />
      ) : exams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center space-y-3">
          <FileText className="h-10 w-10 text-gray-600 mx-auto" />
          <p className="text-base text-gray-200 font-semibold">No exams yet</p>
          <p className="text-sm text-gray-500 max-w-md mx-auto">Create one with AI, pull questions from past papers, or write new questions from a textbook.</p>
          <Button onClick={() => navigate("/exams/new")} className="bg-orange-600 hover:bg-orange-700 text-white h-10 px-5 font-semibold rounded-xl mt-2">
            <Plus className="h-4 w-4 mr-1.5" /> Create New Exam
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {exams.map((exam) => (
            <ExamRow key={exam.id} exam={exam} />
          ))}
        </div>
      )}
    </div>
  )
}
