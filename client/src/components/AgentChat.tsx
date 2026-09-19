import { useEffect, useRef, useState, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import { Send, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ChatTurn } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * The chat panel Abhyas uses for its three agents (Exam Intent, Refinement,
 * Question Review): title bar, one-line hint, scrolling bubbles, input row.
 */
export function AgentChat({
  title,
  hint,
  turns,
  busy,
  busyText = "Thinking...",
  emptyText,
  placeholder,
  onSend,
  footer,
  className,
}: {
  title: string
  hint: ReactNode
  turns: ChatTurn[]
  busy: boolean
  busyText?: string
  emptyText: string
  placeholder: string
  onSend: (message: string) => Promise<boolean | void>
  /** Extra controls under the input, e.g. skip buttons. */
  footer?: ReactNode
  className?: string
}) {
  const [reply, setReply] = useState("")
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" })
  }, [turns.length, busy])

  const send = async () => {
    const outgoing = reply.trim()
    if (!outgoing || busy) return
    setReply("")
    // A false return means the turn failed; put the text back so it isn't lost.
    if ((await onSend(outgoing)) === false) setReply(outgoing)
  }

  return (
    <div className={cn("bg-[#0f0f11] border border-white/10 rounded-2xl p-4 shadow-xl flex flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-white/5 pb-3 mb-3">
        <Sparkles className="h-4 w-4 text-orange-500" />
        <h2 className="text-sm font-bold text-white">{title}</h2>
      </div>
      <p className="text-[11px] text-gray-500 mb-3 -mt-1">{hint}</p>

      <div ref={logRef} className="flex-1 min-h-[200px] max-h-[460px] overflow-y-auto custom-scrollbar space-y-2.5 pr-1" aria-live="polite">
        {turns.length === 0 && !busy && <p className="text-xs text-gray-500 italic text-center py-6">{emptyText}</p>}
        {turns.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-xs [&_ul]:list-disc [&_ul]:list-inside [&_ol]:list-decimal [&_ol]:list-inside [&_p:not(:last-child)]:mb-1.5",
                turn.role === "user" ? "bg-orange-600 text-white" : "bg-zinc-900 border border-white/10 text-gray-200",
              )}
            >
              {turn.role === "assistant" ? <ReactMarkdown>{turn.content}</ReactMarkdown> : turn.content}
            </div>
          </div>
        ))}
        {busy && <p className="text-xs text-gray-500 italic">{busyText}</p>}
      </div>

      <div className="flex gap-2 pt-3 mt-3 border-t border-white/5">
        <Input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="bg-[#14151f] border-white/10 text-gray-200 text-xs h-9"
          disabled={busy}
        />
        <Button onClick={() => void send()} disabled={busy || !reply.trim()} aria-label="Send" className="bg-orange-600 hover:bg-orange-700 text-white shrink-0 h-9 w-9 p-0">
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
      {footer}
    </div>
  )
}
