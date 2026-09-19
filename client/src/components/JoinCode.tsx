import { Copy } from "lucide-react"
import { toast } from "sonner"

export function JoinCode({ code }: { code: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(code).then(
          () => toast.success(`Code ${code} copied`),
          () => toast.error("Couldn't copy the code"),
        )
      }}
      title="Copy code"
      className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 font-mono text-sm font-bold tracking-[0.15em] text-orange-300 hover:bg-orange-500/20"
    >
      {code}
      <Copy className="h-3 w-3" />
    </button>
  )
}
