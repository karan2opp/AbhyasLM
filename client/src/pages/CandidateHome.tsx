import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { Clock, GraduationCap, Loader2, LogIn } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { LoadingRow, PageHeader } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useResource } from "@/lib/hooks"
import type { MySubmission } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_TONES: Record<MySubmission["status"], string> = {
  in_progress: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  evaluating: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  submitted: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
}

const STATUS_LABELS: Record<MySubmission["status"], string> = {
  in_progress: "In progress",
  evaluating: "Marking",
  submitted: "Marked",
}

function SubmissionRow({ submission }: { submission: MySubmission }) {
  const isOpen = submission.status === "in_progress"
  const showScore = submission.status === "submitted" && submission.resultsVisible && submission.score !== null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#0f0f11] p-4 hover:border-white/10 transition-all">
      <div className="flex items-center gap-4 min-w-0">
        <div className="h-10 w-10 bg-orange-600/20 text-orange-400 rounded-lg flex items-center justify-center border border-orange-500/30 shrink-0">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm truncate">{submission.title}</p>
          <p className="text-gray-500 text-xs flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {isOpen ? `Due ${new Date(submission.deadlineAt).toLocaleString()}` : submission.submittedAt ? `Submitted ${new Date(submission.submittedAt).toLocaleString()}` : "Not submitted"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {showScore && (
          <span className="text-sm font-bold text-white tabular-nums">
            {submission.score} <span className="text-gray-500">/ {submission.totalMarks}</span>
          </span>
        )}
        <span className={cn("text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider border", STATUS_TONES[submission.status])}>{STATUS_LABELS[submission.status]}</span>
        {isOpen ? (
          <Link to={`/attempt/${submission.id}`} className="text-xs font-semibold text-orange-400 hover:text-orange-300 px-2">
            Continue
          </Link>
        ) : (
          <Link to={`/results/${submission.id}`} className="text-xs font-semibold text-orange-400 hover:text-orange-300 px-2">
            {submission.status === "evaluating" ? "View" : "See result"}
          </Link>
        )}
      </div>
    </div>
  )
}

export default function CandidateHome() {
  const api = useApi()
  const navigate = useNavigate()
  const mine = useResource<MySubmission[]>("/api/submissions/me", (list) => (list.some((s) => s.status === "evaluating") ? 5000 : null))
  const [code, setCode] = useState("")
  const [joining, setJoining] = useState(false)

  const join = async () => {
    if (!code.trim()) {
      toast.error("Enter the exam code")
      return
    }
    setJoining(true)
    try {
      const result = await api<{ submissionId: string; examTitle: string }>("/api/exams/join", {
        method: "POST",
        body: JSON.stringify({ joinCode: code.trim().toUpperCase() }),
      })
      navigate(`/attempt/${result.submissionId}`)
    } catch (err) {
      toast.error((err as Error).message || "Could not join that exam")
      setJoining(false)
    }
  }

  const list = mine.data ?? []

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader title="My exams" description="Join an exam with the code your examiner gave you, and see your results once they're marked." />

        <Card className="bg-[#0f0f11] border border-white/10 ring-0">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <LogIn className="size-4 text-orange-400" /> Join an exam
            </CardTitle>
            <CardDescription className="text-gray-400">The timer starts as soon as you join, so be ready before you enter the code.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void join()
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. 7KPQX2"
                aria-label="Exam code"
                maxLength={12}
                className="bg-[#14151f] border border-white/15 text-white placeholder:text-zinc-500 h-11 w-44 rounded-lg font-mono tracking-[0.2em] text-center uppercase"
              />
              <Button type="submit" disabled={joining} className="bg-orange-600 hover:bg-orange-700 text-white h-11 px-6 font-bold rounded-xl">
                {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start exam"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-xl font-semibold text-white mb-4">Your attempts</h2>
          {mine.loading ? (
            <LoadingRow label="Loading your exams..." />
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center space-y-3">
              <GraduationCap className="h-10 w-10 text-gray-600 mx-auto" />
              <p className="text-base text-gray-200 font-semibold">No exams yet</p>
              <p className="text-sm text-gray-500 max-w-md mx-auto">Enter a code above to start your first one.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((submission) => (
                <SubmissionRow key={submission.id} submission={submission} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
