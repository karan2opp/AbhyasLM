import { useState } from "react"
import { AlertTriangle, BookMarked, BookOpen, ChevronDown, ChevronRight, Hash, Layers, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { BlueprintSection, BookToc } from "@/lib/types"

export interface SubtopicSourceInfo {
  chapter: string
  section: string
  name: string
  pages: [number, number]
}

/** Book subsection id → where it sits, so each planned subtopic can show the pages it will be written from. */
export function buildSourceLookup(toc: BookToc): Record<string, SubtopicSourceInfo> {
  const lookup: Record<string, SubtopicSourceInfo> = {}
  for (const chapter of toc.chapters) {
    for (const section of chapter.sections) {
      for (const sub of section.subsections) {
        lookup[sub.id] = { chapter: chapter.title, section: section.heading, name: sub.name, pages: sub.pages }
      }
    }
  }
  return lookup
}

export const countBlueprintQuestions = (sections: BlueprintSection[]) =>
  sections.reduce((n, s) => n + s.topics.reduce((m, t) => m + t.subtopics.reduce((k, st) => k + (st.allocatedQuestions || 0), 0), 0), 0)

/**
 * Abhyas's editable plan: sections → topics → subtopics with +/- question
 * counts. Each section here is one subject and question type, so there is no
 * separate "block" level.
 */
export function BlueprintTreeViewer({
  title,
  sections,
  onChange,
  sourceLookup,
}: {
  title: string
  sections: BlueprintSection[]
  onChange: (sections: BlueprintSection[]) => void
  sourceLookup?: Record<string, SubtopicSourceInfo>
}) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})

  const update = (updater: (draft: BlueprintSection[]) => void) => {
    const next = structuredClone(sections)
    updater(next)
    // A topic's count is always the sum of its subtopics — the generator only reads subtopic counts.
    for (const section of next) {
      for (const topic of section.topics) topic.allocatedQuestions = topic.subtopics.reduce((n, st) => n + (st.allocatedQuestions || 0), 0)
    }
    onChange(next)
  }

  const totalQuestions = countBlueprintQuestions(sections)

  return (
    <div className="space-y-6 bg-[#0f0f11] border border-white/10 rounded-2xl p-6 shadow-2xl">
      <div className="bg-[#14151f] border border-white/10 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold text-orange-400 uppercase tracking-wider block mb-1">Exam Blueprint</span>
          <h2 className="text-xl font-extrabold text-white">{title}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Review and adjust topics, subtopics, and question counts below.</p>
        </div>
        <div className="flex items-center gap-3 bg-[#0a0a0d] border border-white/10 px-4 py-2.5 rounded-xl shrink-0">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-orange-400" />
            <span className="text-xs font-bold text-white">{totalQuestions} Questions</span>
          </div>
          <span className="text-zinc-700">|</span>
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-bold text-white">{sections.length} Sections</span>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {sections.map((section, sIdx) => {
          const isCollapsed = collapsed[sIdx]
          const sectionCount = section.topics.reduce((n, t) => n + t.subtopics.reduce((m, st) => m + (st.allocatedQuestions || 0), 0), 0)

          return (
            <div key={sIdx} className="bg-[#12131a] border border-white/10 rounded-xl overflow-hidden shadow-lg">
              <div className="bg-[#181924] px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-white/5 select-none">
                <button type="button" className="flex items-center gap-3 text-left" onClick={() => setCollapsed((p) => ({ ...p, [sIdx]: !p[sIdx] }))} aria-expanded={!isCollapsed}>
                  <span className="h-7 w-7 flex items-center justify-center text-zinc-400">
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </span>
                  <span className="text-xs font-extrabold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/30">
                    Section {String.fromCharCode(65 + sIdx)}
                  </span>
                  <span className="text-sm font-bold text-white">{section.name}</span>
                  <span className="text-[10px] font-semibold text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10 uppercase">{section.subject}</span>
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-300">{sectionCount} Questions</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      update((d) => {
                        d[sIdx]!.topics.push({ topic: "New Topic", weight: 0, allocatedQuestions: 1, subtopics: [{ name: "New Subtopic", weight: 0, allocatedQuestions: 1 }] })
                      })
                    }
                    className="bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-xs font-bold h-8 px-3"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Topic
                  </Button>
                </div>
              </div>

              {!isCollapsed && (
                <div className="p-5 space-y-4">
                  {section.unmatchedTopics && section.unmatchedTopics.length > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                      <span>
                        Not found in this book, so no questions were planned for: <span className="font-semibold">{section.unmatchedTopics.join(", ")}</span>
                      </span>
                    </div>
                  )}
                  {section.topics.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic text-center py-4">No topics in this section yet.</p>
                  ) : (
                    section.topics.map((topic, tIdx) => {
                      const topicCount = topic.subtopics.reduce((n, st) => n + (st.allocatedQuestions || 0), 0)
                      return (
                        <div key={tIdx} className="bg-[#0f1018] border border-white/5 rounded-xl p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
                            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                              <BookOpen className="h-4 w-4 text-orange-400 shrink-0" />
                              <Input
                                value={topic.topic}
                                onChange={(e) => update((d) => void (d[sIdx]!.topics[tIdx]!.topic = e.target.value))}
                                aria-label="Topic name"
                                className="bg-[#0b0c10] border border-white/10 text-white font-bold text-sm h-9 flex-1 focus:border-orange-500"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded border border-orange-500/30 shrink-0">{topicCount} Questions</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => update((d) => void d[sIdx]!.topics[tIdx]!.subtopics.push({ name: "New Subtopic", weight: 0, allocatedQuestions: 1 }))}
                                className="text-xs text-orange-300 hover:text-white bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 h-8 px-2.5"
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" /> Subtopic
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Delete topic ${topic.topic}`}
                                onClick={() => update((d) => void d[sIdx]!.topics.splice(tIdx, 1))}
                                className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 px-2"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2 pl-4">
                            {topic.subtopics.map((sub, stIdx) => (
                              <div key={stIdx} className="bg-[#0b0c10] border border-white/5 rounded-lg px-3.5 py-2 hover:border-white/20 transition-all">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-orange-400 text-xs font-bold" aria-hidden="true">•</span>
                                  <Input
                                    value={sub.name}
                                    onChange={(e) => update((d) => void (d[sIdx]!.topics[tIdx]!.subtopics[stIdx]!.name = e.target.value))}
                                    aria-label="Subtopic name"
                                    className="bg-transparent border-none shadow-none text-xs text-zinc-100 font-medium h-7 flex-1 px-1"
                                  />
                                  <div className="flex items-center gap-2 shrink-0">
                                    <div className="flex items-center bg-[#151624] border border-white/10 rounded-md overflow-hidden h-7">
                                      <button
                                        type="button"
                                        aria-label={`One fewer question for ${sub.name}`}
                                        onClick={() => update((d) => {
                                          const st = d[sIdx]!.topics[tIdx]!.subtopics[stIdx]!
                                          st.allocatedQuestions = Math.max(0, (st.allocatedQuestions || 0) - 1)
                                        })}
                                        className="px-2 text-xs text-zinc-400 hover:text-white hover:bg-white/10 h-full font-bold transition-colors"
                                      >
                                        -
                                      </button>
                                      <span className="px-2.5 text-xs font-bold text-orange-400 border-x border-white/10 min-w-[70px] text-center tabular-nums">
                                        {sub.allocatedQuestions || 0} Questions
                                      </span>
                                      <button
                                        type="button"
                                        aria-label={`One more question for ${sub.name}`}
                                        onClick={() => update((d) => {
                                          const st = d[sIdx]!.topics[tIdx]!.subtopics[stIdx]!
                                          st.allocatedQuestions = (st.allocatedQuestions || 0) + 1
                                        })}
                                        className="px-2 text-xs text-zinc-400 hover:text-white hover:bg-white/10 h-full font-bold transition-colors"
                                      >
                                        +
                                      </button>
                                    </div>
                                    <button
                                      type="button"
                                      aria-label={`Delete subtopic ${sub.name}`}
                                      onClick={() => update((d) => void d[sIdx]!.topics[tIdx]!.subtopics.splice(stIdx, 1))}
                                      className="text-zinc-500 hover:text-red-400 p-1 transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                                {sourceLookup && <SubtopicSource sourceNodeIds={sub.sourceNodeIds} sourceLookup={sourceLookup} />}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SubtopicSource({ sourceNodeIds, sourceLookup }: { sourceNodeIds?: string[]; sourceLookup: Record<string, SubtopicSourceInfo> }) {
  const sources = (sourceNodeIds ?? []).map((id) => sourceLookup[id]).filter((s): s is SubtopicSourceInfo => !!s)
  if (sources.length === 0) {
    return <p className="mt-1.5 pl-5 text-[11px] text-zinc-500 italic">No book section linked yet. One is matched when questions are generated.</p>
  }
  return (
    <div className="mt-1.5 pl-5 space-y-0.5">
      {sources.map((source, i) => (
        <p key={i} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <BookMarked className="h-3 w-3 text-emerald-400 shrink-0" />
          <span className="truncate">
            {source.chapter} › {source.section === source.name ? source.name : `${source.section} › ${source.name}`}
          </span>
          <span className="shrink-0 text-zinc-500">· {source.pages[0] === source.pages[1] ? `p. ${source.pages[0]}` : `pp. ${source.pages[0]}–${source.pages[1]}`}</span>
        </p>
      ))}
    </div>
  )
}
