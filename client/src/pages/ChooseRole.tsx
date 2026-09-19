import { useState } from "react"
import { GraduationCap, Loader2, PencilRuler } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useApi } from "@/lib/api"
import { useSession } from "@/lib/session"
import { cn } from "@/lib/utils"

type Choice = "examiner" | "candidate"

const CHOICES: { id: Choice; label: string; icon: typeof PencilRuler; points: string[] }[] = [
  {
    id: "examiner",
    label: "I set exams",
    icon: PencilRuler,
    points: ["Generate questions with AI", "Upload past papers and textbooks", "Publish exams and review results"],
  },
  {
    id: "candidate",
    label: "I take exams",
    icon: GraduationCap,
    points: ["Join an exam with a code", "Answer within the time limit", "See your marks and feedback"],
  },
]

/** Shown once, right after signing up. An admin can change a role later. */
export default function ChooseRole() {
  const api = useApi()
  const { reload } = useSession()
  const [choice, setChoice] = useState<Choice | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!choice) return
    setSaving(true)
    try {
      await api("/api/me/role", { method: "POST", body: JSON.stringify({ role: choice }) })
      await reload()
    } catch (err) {
      toast.error((err as Error).message || "Could not save your role")
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">How will you use AbhyasLM?</h1>
          <p className="text-gray-400">Pick one to set up your account. You can switch anytime from the sidebar.</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" role="radiogroup" aria-label="Your role">
          {CHOICES.map((c) => {
            const Icon = c.icon
            const isSelected = choice === c.id
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setChoice(c.id)}
                className={cn(
                  "text-left rounded-2xl border p-6 space-y-4 transition-all",
                  isSelected ? "border-orange-500/60 bg-orange-500/10 ring-1 ring-orange-500/30" : "border-white/10 bg-[#0f0f11] hover:border-orange-500/40 hover:bg-[#15151a]",
                )}
              >
                <div className="h-12 w-12 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center">
                  <Icon className="h-6 w-6 text-orange-400" />
                </div>
                <h2 className="text-lg font-bold text-white">{c.label}</h2>
                <ul className="space-y-1.5">
                  {c.points.map((p) => (
                    <li key={p} className="text-sm text-gray-400 flex gap-2">
                      <span className="text-orange-400" aria-hidden="true">
                        •
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </button>
            )
          })}
        </div>

        <div className="flex justify-center">
          <Button
            onClick={() => void save()}
            disabled={!choice || saving}
            className="bg-orange-600 hover:bg-orange-700 text-white h-11 px-8 font-bold rounded-xl shadow-lg shadow-orange-950/40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
          </Button>
        </div>
      </div>
    </main>
  )
}
