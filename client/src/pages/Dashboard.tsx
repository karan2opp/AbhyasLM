import { useUser } from "@clerk/react"
import { useNavigate } from "react-router"
import { BookOpen, FileText, Library, Plus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/workspace"
import { useResource } from "@/lib/hooks"
import type { BookSummary, PaperDocument, SessionListResponse } from "@/lib/types"

function StatCard({ title, value, hint, icon: Icon, tone = "text-white" }: { title: string; value: number | string; hint: string; icon: React.ElementType; tone?: string }) {
  return (
    <Card className="bg-[#0f0f11] border border-white/5 ring-0">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-400">{title}</CardTitle>
        <Icon className="h-4 w-4 text-orange-400" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
        <p className="text-xs text-gray-500 mt-1">{hint}</p>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { user } = useUser()
  const navigate = useNavigate()
  // pageSize 60 (the max) is plenty for a dashboard overview — the Exams page
  // itself is the authoritative, properly paginated list.
  const sessions = useResource<SessionListResponse>("/api/generation-agents/sessions?pageSize=60")
  const papers = useResource<PaperDocument[]>("/api/question-bank/documents")
  const books = useResource<BookSummary[]>("/api/books")

  const exams = sessions.data?.sessions ?? []
  const totalExams = sessions.data?.total ?? 0

  return (
    <div className="p-6 md:p-10 flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description={`Welcome back${user?.firstName ? `, ${user.firstName}` : ""}. Build exams from AI, past papers, or your own textbooks.`}
        actions={
          <Button onClick={() => navigate("/exams/new")} className="bg-orange-600 hover:bg-orange-700 text-white h-10 px-5 font-semibold rounded-xl shadow-lg shadow-orange-950/40">
            <Plus className="h-4 w-4 mr-1.5" /> Create New Exam
          </Button>
        }
      />

      {sessions.error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300" role="alert">
          Couldn&apos;t reach the API: {sessions.error}. Is the server running on port 8000?
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard title="Total Exams" value={totalExams} hint="Exams you've started" icon={FileText} />
        <StatCard title="AI Generated Exams" value={exams.filter((e) => !e.bookId).length} hint="Not sourced from a book" icon={Sparkles} tone="text-orange-300" />
        <StatCard title="Past Papers" value={(papers.data ?? []).filter((d) => d.status === "completed").length} hint="Processed and searchable" icon={Library} />
        <StatCard title="Books" value={(books.data ?? []).filter((b) => b.status === "completed").length} hint="Indexed and ready to use" icon={BookOpen} tone="text-amber-400" />
      </div>
    </div>
  )
}
