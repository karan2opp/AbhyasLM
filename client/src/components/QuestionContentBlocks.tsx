// Renders a question's content_blocks (code / table / list) and an option's
// isCode flag — the two pieces every question-display screen needs, that
// none of them had before. Written once here and used identically on all 5
// screens that show a question (student exam, student results, teacher
// preview, teacher submission view, teacher review), which previously each
// carried their own copy of the surrounding markdown styling.
//
// "size" mirrors the two visual scales already in use across those screens:
// "large" for the exam-taking and preview screens, "compact" for the
// results/review screens — matching their existing ReactMarkdown code-block
// styling exactly, just parameterized instead of copy-pasted.

import ReactMarkdown from "react-markdown";
import { MATH_REMARK_PLUGINS, MATH_REHYPE_PLUGINS, hasMarkup } from "@/lib/markdownMath";

export interface ContentBlock {
  type: "code" | "table" | "list";
  // code
  language?: string;
  code?: string;
  // table
  headers?: string[];
  rows?: (string | null)[][];
  // list
  ordered?: boolean;
  items?: string[];
}

type Size = "large" | "compact";

const SIZES = {
  large: {
    wrap: "my-6 rounded-2xl overflow-hidden border border-white/10 bg-[#09090b] shadow-2xl font-normal",
    header: "bg-white/5 px-4 py-3 border-b border-white/5 flex items-center gap-2",
    dot: "w-3.5 h-3.5 rounded-full",
    lang: "ml-3 text-sm font-mono text-gray-500 tracking-wider uppercase",
    body: "p-6 overflow-x-auto custom-scrollbar",
    code: "block font-mono text-[16px] md:text-lg leading-relaxed text-gray-300 whitespace-pre-wrap",
    inlineCode: "bg-orange-500/10 px-2 py-1 rounded text-lg text-orange-300 font-mono border border-orange-500/30 font-normal",
    table: "text-[15px]",
    cell: "px-4 py-2.5",
    list: "text-[15px] leading-relaxed",
  },
  compact: {
    wrap: "my-3 rounded-xl overflow-hidden border border-white/10 bg-[#09090b]",
    header: "bg-white/5 px-3 py-2 border-b border-white/5 flex items-center gap-2",
    dot: "w-2.5 h-2.5 rounded-full",
    lang: "ml-2.5 text-[11px] font-mono text-gray-500 tracking-wider uppercase",
    body: "p-4 overflow-x-auto custom-scrollbar font-normal",
    code: "block font-mono text-xs leading-relaxed text-gray-300 whitespace-pre-wrap",
    inlineCode: "bg-orange-500/10 px-1.5 py-0.5 rounded text-xs text-orange-300 font-mono border border-orange-500/30",
    table: "text-xs",
    cell: "px-3 py-2",
    list: "text-sm leading-relaxed",
  },
} as const;

function CodeBlock({ language, code, s }: { language?: string; code?: string; s: (typeof SIZES)[Size] }) {
  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <div className={`${s.dot} bg-[#ff5f56]`} />
        <div className={`${s.dot} bg-[#ffbd2e]`} />
        <div className={`${s.dot} bg-[#27c93f]`} />
        <span className={s.lang}>{language || "code"}</span>
      </div>
      <div className={s.body}>
        <code className={s.code}>{code}</code>
      </div>
    </div>
  );
}

function TableBlock({ headers, rows, s }: { headers?: string[]; rows?: (string | null)[][]; s: (typeof SIZES)[Size] }) {
  return (
    <div className={`my-4 overflow-x-auto rounded-xl border border-white/10 ${s.table}`}>
      <table className="w-full border-collapse">
        {headers && headers.length > 0 && (
          <thead>
            <tr className="bg-white/5">
              {headers.map((h, i) => (
                <th key={i} className={`${s.cell} text-left font-semibold text-white border-b border-white/10`}>{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {(rows || []).map((row, ri) => (
            <tr key={ri} className={ri % 2 === 1 ? "bg-white/[0.02]" : undefined}>
              {row.map((cell, ci) => (
                <td key={ci} className={`${s.cell} text-gray-300 border-b border-white/5 font-mono`}>{cell ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListBlock({ ordered, items, s }: { ordered?: boolean; items?: string[]; s: (typeof SIZES)[Size] }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`my-3 ${ordered ? "list-decimal" : "list-disc"} pl-6 space-y-1 text-gray-300 ${s.list}`}>
      {(items || []).map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </Tag>
  );
}

/**
 * Renders every content block in order — code, table, or list — between the
 * question text and its options. Renders nothing when there are none, which
 * is the common case for most questions.
 */
export function ContentBlocksView({ blocks, size = "large" }: { blocks?: ContentBlock[] | null; size?: Size }) {
  if (!blocks || blocks.length === 0) return null;
  const s = SIZES[size];

  return (
    <div className="not-prose">
      {blocks.map((block, i) => {
        if (block.type === "code") return <CodeBlock key={i} language={block.language} code={block.code} s={s} />;
        if (block.type === "table") return <TableBlock key={i} headers={block.headers} rows={block.rows} s={s} />;
        if (block.type === "list") return <ListBlock key={i} ordered={block.ordered} items={block.items} s={s} />;
        return null;
      })}
    </div>
  );
}

/**
 * One MCQ option's text. Code options keep their exact spacing and line breaks (multi-line program output);
 * other options render inline maths ($...$) and `code`, or plain text when there is nothing to render.
 */
export function OptionValue({ value, isCode, size = "large" }: { value: string; isCode?: boolean; size?: Size }) {
  const s = SIZES[size];
  if (isCode) {
    if (!value.includes("\n")) return <code className={s.inlineCode}>{value}</code>;
    return (
      <code className={`${s.inlineCode} block w-fit min-w-[4rem] whitespace-pre px-3 py-2 leading-relaxed`}>{value}</code>
    );
  }
  if (!hasMarkup(value)) return <>{value}</>;
  return (
    <ReactMarkdown
      remarkPlugins={MATH_REMARK_PLUGINS}
      rehypePlugins={MATH_REHYPE_PLUGINS}
      components={{
        p: ({ children }) => <>{children}</>,
        code: ({ children }) => <code className={s.inlineCode}>{children}</code>,
      }}
    >
      {value}
    </ReactMarkdown>
  );
}
