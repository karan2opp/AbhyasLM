import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          "flex field-sizing-content min-h-16 w-full rounded-lg border border-white/15 bg-[#14151f] px-3 py-2.5 text-base text-white transition-colors outline-none placeholder:text-zinc-400 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus:border-white/30 focus-visible:border-white/30 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 shadow-inner md:text-sm",
          className
        )}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
