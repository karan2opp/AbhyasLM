import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeft, Loader2, Plus, Save, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { LoadingRow, PageHeader, labelClass } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useResource } from "@/lib/hooks"
import type { ExamDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

const fieldClass = "bg-[#14151f] border border-white/15 text-white placeholder:text-zinc-500 rounded-lg text-sm h-10"

/** A Date as the local "YYYY-MM-DDTHH:mm" a datetime-local input expects. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function EditExam() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const api = useApi()
  const detail = useResource<{ exam: ExamDetail }>(`/api/exams/${examId}`)

  const [title, setTitle] = useState("")
  const [duration, setDuration] = useState("")
  const [opensAt, setOpensAt] = useState("")
  const [closesAt, setClosesAt] = useState("")
  const [instructions, setInstructions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    const exam = detail.data?.exam
    if (!exam || initialized) return
    setInitialized(true)
    setTitle(exam.title)
    setDuration(String(exam.durationMinutes))
    setOpensAt(exam.opensAt ? toLocalInputValue(exam.opensAt) : "")
    setClosesAt(exam.closesAt ? toLocalInputValue(exam.closesAt) : "")
    setInstructions(exam.instructions?.length ? exam.instructions : [""])
  }, [detail.data, initialized])

  if (detail.loading && !detail.data) return <div className="p-10"><LoadingRow label="Loading exam..." /></div>

  const exam = detail.data?.exam
  if (!exam) {
    return (
      <div className="p-10 text-center space-y-3">
        <p className="text-red-400">{detail.error ?? "Exam not found"}</p>
        <Link to="/exams" className="text-orange-400 hover:text-orange-300 text-sm font-semibold">
          Back to exams
        </Link>
      </div>
    )
  }

  const save = async () => {
    if (!title.trim()) {
      toast.error("Give the exam a title")
      return
    }
    const minutes = Number(duration)
    if (!Number.isFinite(minutes) || minutes < 1) {
      toast.error("Enter how long candidates get, in minutes")
      return
    }
    if (!opensAt || !closesAt) {
      toast.error("Set both a start and end time")
      return
    }
    if (new Date(closesAt) <= new Date(opensAt)) {
      toast.error("The closing time must be after the opening time")
      return
    }
    setSaving(true)
    try {
      await api(`/api/exams/${examId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          durationMinutes: minutes,
          opensAt: new Date(opensAt).toISOString(),
          closesAt: new Date(closesAt).toISOString(),
          instructions: instructions.map((i) => i.trim()).filter(Boolean),
        }),
      })
      toast.success("Exam updated")
      navigate(`/published/${examId}`)
    } catch (err) {
      toast.error((err as Error).message || "Could not save these changes")
      setSaving(false)
    }
  }

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <PageHeader
          title="Edit exam"
          description="Change the title, schedule, time limit, or instructions. This doesn't touch questions already answered by candidates."
        />

        <Card className="bg-[#0f0f11] border border-white/10 ring-0">
          <CardHeader>
            <CardTitle className="text-white">Details</CardTitle>
            <CardDescription className="text-gray-400">Join code and questions can&apos;t be changed here.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <label className="block space-y-1.5">
              <span className={labelClass}>Title</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
            </label>

            <label className="block space-y-1.5">
              <span className={labelClass}>Time limit (minutes)</span>
              <Input type="number" min={1} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} className={cn(fieldClass, "w-40 font-bold")} />
              <span className="block text-xs text-gray-500">Only affects new attempts — anyone already taking the exam keeps their original deadline.</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <label className="block space-y-1.5">
                <span className={labelClass}>Start time</span>
                <Input type="datetime-local" required value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className={cn(fieldClass, "[color-scheme:dark]")} />
              </label>
              <label className="block space-y-1.5">
                <span className={labelClass}>End time</span>
                <Input type="datetime-local" required value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={cn(fieldClass, "[color-scheme:dark]")} />
              </label>
            </div>
            <p className="text-xs text-gray-500 -mt-3">Both are required — outside this window nobody can start the exam.</p>

            <div className="space-y-2">
              <span className={labelClass}>Instructions</span>
              <div className="space-y-2">
                {instructions.map((line, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={line}
                      onChange={(e) => setInstructions((prev) => prev.map((v, j) => (i === j ? e.target.value : v)))}
                      placeholder={`Instruction ${i + 1}`}
                      className={cn(fieldClass, "flex-1")}
                    />
                    {instructions.length > 1 && (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Remove instruction ${i + 1}`}
                        onClick={() => setInstructions((prev) => prev.filter((_, j) => j !== i))}
                        className="bg-transparent border-white/10 text-red-400 hover:bg-red-500/10 h-10 w-10 shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={() => setInstructions((prev) => [...prev, ""])}
                  className="w-full h-10 bg-transparent border-dashed border-white/10 text-gray-400 hover:text-white hover:bg-white/5"
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Instruction
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="ghost" disabled={saving} onClick={() => navigate(`/published/${examId}`)} className="text-gray-400 hover:text-white h-10 px-4 text-sm font-semibold">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white h-10 px-6 font-bold text-sm rounded-xl shadow-lg shadow-orange-950/40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" /> Save Changes</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
