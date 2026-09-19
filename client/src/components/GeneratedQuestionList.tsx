import { useState } from "react"
import ReactMarkdown from "react-markdown"
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ContentBlocksView, OptionValue } from "@/components/QuestionContentBlocks"
import { MATH_REHYPE_PLUGINS, MATH_REMARK_PLUGINS } from "@/lib/markdownMath"
import type { GeneratedExam, StoredQuestion } from "@/lib/types"
import { cn } from "@/lib/utils"

const LETTERS = ["A", "B", "C", "D"]

/** Question text is markdown with LaTeX maths, rendered the way Abhyas's question builder renders it. */
export function QuestionMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={MATH_REMARK_PLUGINS}
      rehypePlugins={MATH_REHYPE_PLUGINS}
      components={{
        pre: ({ children }) => (
          <div className="my-5 rounded-xl overflow-hidden border border-white/10 bg-[#09090b] shadow-2xl">
            <div className="bg-white/5 px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
              <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
            </div>
            <div className="p-5 overflow-x-auto custom-scrollbar font-normal">{children}</div>
          </div>
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !(className?.includes("language-") || String(children ?? "").includes("\n"))
          return isInline ? (
            <code className="bg-orange-500/10 px-1.5 py-0.5 rounded text-[13px] text-orange-300 font-mono border border-orange-500/30" {...props}>
              {children}
            </code>
          ) : (
            <code className={"block font-mono text-[13px] leading-relaxed text-gray-300 whitespace-pre-wrap" + (className ? " " + className : "")} {...props}>
              {children}
            </code>
          )
        },
        p: (props) => <p className="mb-2 last:mb-0" {...props} />,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

function QuestionItem({ question, number }: { question: StoredQuestion; number: number }) {
  return (
    <div className="bg-[#18181b]/60 border border-white/5 rounded-2xl p-6 relative overflow-hidden shadow-sm hover:border-white/10 transition-all">
      <div className="absolute top-0 left-0 bg-orange-500/10 text-orange-400 font-mono text-xs font-bold px-3 py-1.5 rounded-br-xl border-b border-r border-orange-500/30">
        Q{number}
      </div>

      <div className="pt-4">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span
            className={cn(
              "px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border",
              question.type === "mcq" ? "bg-orange-500/10 text-orange-400 border-orange-500/30" : "bg-amber-500/10 text-amber-400 border-amber-500/20",
            )}
          >
            {question.type === "mcq" ? "Multiple Choice" : "Descriptive"}
          </span>
          <span className="border border-white/10 bg-white/5 px-2.5 py-1 rounded-md text-gray-300 text-[10px] font-bold">Marks: {question.marks}</span>
          <span className="border border-white/10 bg-white/5 px-2.5 py-1 rounded-md text-gray-400 text-[10px] font-semibold truncate max-w-[260px]">{question.subtopic}</span>
        </div>

        <div className="text-white text-[15px] leading-relaxed mb-6 font-medium max-w-none">
          <QuestionMarkdown text={question.question_text} />
        </div>

        <div className="max-w-3xl -mt-3 mb-5">
          <ContentBlocksView blocks={question.content_blocks} size="compact" />
        </div>

        {question.type === "mcq" ? (
          <div className="space-y-2.5 max-w-3xl">
            {question.options.map((opt, i) => {
              const isCorrect = LETTERS[i] === question.correct_option
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center p-3.5 rounded-xl border text-[14px]",
                    isCorrect ? "bg-green-500/10 border-green-500/30 text-green-300" : "bg-[#0f0f11] border-white/5 text-gray-400",
                  )}
                >
                  {isCorrect ? (
                    <CheckCircle2 className="h-4 w-4 mr-3.5 shrink-0 text-green-400" aria-label="Correct answer" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-gray-600 mr-3.5 shrink-0" />
                  )}
                  <span className="font-mono text-xs text-gray-500 mr-2">{LETTERS[i]}.</span>
                  <span className="font-medium">
                    <OptionValue value={opt.text} isCode={opt.isCode} size="compact" />
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <details className="max-w-3xl rounded-xl border border-white/10 bg-[#0f0f11] group">
            <summary className="cursor-pointer px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-300 hover:text-white">Grading rubric</summary>
            <ul className="px-4 pb-4 space-y-3">
              {question.rubric.categories.map((c) => (
                <li key={c.name} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-white">{c.name}</span>
                    <span className="text-xs font-bold text-amber-400 tabular-nums">{Math.round(c.weight * 100)}%</span>
                  </div>
                  <ul className="mt-1 list-disc pl-5 text-xs text-gray-400 space-y-0.5">
                    {c.key_points.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}

/**
 * Questions are numbered 1, 2, 3… within each section, straight through its
 * topics — the same numbering the Question Review Agent uses, so "question 4"
 * means the same thing on screen and in chat.
 */
export function GeneratedQuestionList({ exam }: { exam: GeneratedExam }) {
  return (
    <div className="space-y-8">
      {exam.sections.map((section, idx) => (
        <SectionCard key={section.name} section={section} index={idx} />
      ))}
    </div>
  )
}

function SectionCard({ section, index }: { section: GeneratedExam["sections"][number]; index: number }) {
  const [isExpanded, setIsExpanded] = useState(true)
  const total = section.topics.reduce((n, t) => n + t.questions.length, 0)
  let number = 0

  return (
    <Card className="bg-[#0f0f11]/80 border border-white/10 ring-0 shadow-xl overflow-hidden py-0 gap-0">
      <div className="bg-[#18181b] px-6 py-4 flex items-center justify-between gap-3 border-b border-white/5">
        <div className="flex-1 flex items-center gap-4 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 -ml-2 text-gray-400 hover:text-white"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? `Collapse ${section.name}` : `Expand ${section.name}`}
          >
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </Button>
          <span className="text-orange-400 font-bold bg-orange-500/10 px-2.5 py-1 rounded">S{index + 1}</span>
          <h3 className="text-lg font-bold text-white tracking-wide truncate">{section.name}</h3>
          <span className="hidden sm:inline text-xs text-gray-500">{section.subject}</span>
        </div>
        <span className="text-xs font-semibold text-gray-300 shrink-0">{total} Questions</span>
      </div>

      {isExpanded && (
        <CardContent className="p-6 space-y-6">
          {section.topics.map((topic) => (
            <div key={topic.topic} className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">{topic.topic}</h4>
              {topic.questions.map((q) => (
                <QuestionItem key={q.id} question={q} number={++number} />
              ))}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  )
}
