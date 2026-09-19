import { useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { useApi } from "@/lib/api"
import { useRole, useSession } from "@/lib/session"
import { cn } from "@/lib/utils"

const OPTIONS = [
  { value: "examiner", label: "Examiner" },
  { value: "candidate", label: "Candidate" },
] as const

/**
 * Lets any examiner or candidate flip their own role at will — e.g. someone
 * who sets exams and also wants to sit one doesn't need an admin's help to
 * switch back and forth. Admins aren't shown this: their role is granted by
 * another admin (or ADMIN_EMAILS) and isn't self-service.
 */
export function RoleToggle() {
  const role = useRole()
  const api = useApi()
  const { reload } = useSession()
  const navigate = useNavigate()
  const [switching, setSwitching] = useState(false)

  if (role !== "examiner" && role !== "candidate") return null

  const switchTo = async (next: "examiner" | "candidate") => {
    if (next === role || switching) return
    setSwitching(true)
    try {
      await api("/api/me/role", { method: "POST", body: JSON.stringify({ role: next }) })
      await reload()
      // The two roles see entirely different pages, so land on the shared "/" rather than a page the new role can't see.
      navigate("/")
      toast.success(`Switched to ${next === "examiner" ? "Examiner" : "Candidate"}`)
    } catch (err) {
      toast.error((err as Error).message || "Could not switch role")
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="space-y-1">
      <span className="block px-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Switch role</span>
      <div className="flex rounded-lg border border-white/10 bg-[#0b0b0d] p-0.5" role="radiogroup" aria-label="Switch role">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={role === opt.value}
            disabled={switching}
            onClick={() => void switchTo(opt.value)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-60",
              role === opt.value ? "bg-orange-600 text-white" : "text-gray-400 hover:text-white hover:bg-white/5",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
