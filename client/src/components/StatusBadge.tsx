import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react"

type Status = "pending" | "processing" | "completed" | "failed"

const STATUS = {
  pending: { icon: Clock, label: "Pending", cls: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30" },
  processing: { icon: Loader2, label: "Processing", cls: "bg-amber-500/10 text-amber-300 ring-amber-500/30" },
  completed: { icon: CheckCircle2, label: "Ready", cls: "bg-green-500/10 text-green-400 ring-green-500/30" },
  failed: { icon: XCircle, label: "Failed", cls: "bg-red-500/10 text-red-400 ring-red-500/30" },
} as const

/** Pipeline status pill from Abhyas's Question Bank Lab. */
export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const { icon: Icon, label: defaultLabel, cls } = STATUS[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 shrink-0 ${cls}`}>
      <Icon className={`size-3 ${status === "processing" ? "animate-spin" : ""}`} aria-hidden="true" /> {label ?? defaultLabel}
    </span>
  )
}
