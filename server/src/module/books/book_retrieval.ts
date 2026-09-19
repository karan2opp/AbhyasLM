import { z } from "zod";
import { inArray } from "drizzle-orm";
import db from "../../common/db/index.js";
import { ApiError } from "../../common/utils/ApiError.js";
import { bookContents } from "./book.schema.js";
import { getBook } from "./book.service.js";
import { callStructured } from "./book_ai.js";
import { canAccessDocument } from "../question_bank/question_bank.service.js";
import type { QuestionBankAccess } from "../question_bank/qdrant_client.js";
import type { ISection, Difficulty, EducationLevel } from "../generation_agents/Types/inputExam.js";
import type { TopicSpecificInstruction } from "../generation_agents/Types/outputConversation.js";

// Source text sent to the question writer for one topic, split across its subtopics.
export const TOPIC_SOURCE_CHARS = 40_000;

export interface OutlineEntry {
    ref: string;
    nodeId: string;
    name: string;
    chapter: string;
    section: string;
    description: string;
    keyConcepts: string[];
    pages: [number, number];
}

/** A book the caller may use for generation: accessible to them and fully indexed. */
export async function getUsableBook(bookId: string, access: QuestionBankAccess) {
    const book = await getBook(bookId);
    if (!book || !canAccessDocument(book, access)) throw ApiError.notFound("Book not found");
    if (book.status !== "completed" || !book.toc) throw ApiError.badRequest(`"${book.title}" is still being indexed`);
    return book;
}

/** Every subsection of the book in reading order, with a short reference ("S12") the model can cite safely. */
export async function loadBookOutline(bookId: string): Promise<OutlineEntry[]> {
    const book = await getBook(bookId);
    if (!book?.toc) throw new Error(`Book ${bookId} has no index`);
    const entries: OutlineEntry[] = [];
    for (const chapter of book.toc.chapters) {
        for (const section of chapter.sections) {
            for (const sub of section.subsections) {
                entries.push({
                    ref: `S${entries.length + 1}`,
                    nodeId: sub.id,
                    name: sub.name,
                    chapter: chapter.title,
                    section: section.heading,
                    description: sub.description,
                    keyConcepts: sub.keyConcepts,
                    pages: sub.pages,
                });
            }
        }
    }
    return entries;
}

function renderOutline(entries: OutlineEntry[]): string {
    const lines: string[] = [];
    let chapter = "";
    let section = "";
    for (const e of entries) {
        if (e.chapter !== chapter) {
            chapter = e.chapter;
            section = "";
            lines.push(`CHAPTER: ${chapter}`);
        }
        if (e.section !== section) {
            section = e.section;
            lines.push(`  SECTION: ${section}`);
        }
        const concepts = e.keyConcepts.length ? ` Key concepts: ${e.keyConcepts.join(", ")}.` : "";
        lines.push(`    [${e.ref}] ${e.name} (pages ${e.pages[0]}–${e.pages[1]}): ${e.description}${concepts}`);
    }
    return lines.join("\n");
}

const topicName = (t: ISection["topics"][number]) => (typeof t === "string" ? t : t.topic);
const normalize = (s: string) => s.trim().toLowerCase();

export interface BookSubtopic {
    name: string;
    weight: number;
    sourceNodeIds: string[];
}

export interface BookTopic {
    topic: string;
    weight: number;
    subtopics: BookSubtopic[];
}

const BOOK_SUBTOPICS_PROMPT = `You plan the coverage of one exam section using a specific textbook. The questions will be written from the text of the book subsections you choose, so choose carefully.

You receive the teacher's topics for this section, the number of questions, the difficulty, the education level, the teacher's instructions, and the book's table of contents. Each subsection in the table of contents has a reference like [S12], its chapter and section, its pages, a description of what it teaches, and its key concepts.

For each topic:
- Choose the subsections whose content actually teaches that topic. Prefer subsections that are about the topic over ones that only mention it in passing.
- Leave out front matter such as the title page, preface or a printed contents page.
- A subsection may be chosen for only one topic.
- Choose no more subsections than the topic's share of the questions can reasonably cover; when there are more candidates, keep the most central ones.
- If the teacher named specific subtopics or concepts for a topic, choose the subsections that cover them.
- If the book does not cover the topic at all, return the topic with an empty "subsections" list. Never pick an unrelated subsection just to fill it.

Weights: give every topic a weight for its share of emphasis in the section (all topic weights sum to 1), and every chosen subsection a weight within its topic (they sum to 1 within the topic). Follow the teacher's instructions first, then the difficulty and education level, then how much of the topic each subsection covers.

Return every topic exactly as the teacher wrote it, and cite subsections only by their reference, such as "S12".`;

const BookSubtopicsZodSchema = z.object({
    topics: z.array(
        z.object({
            topic: z.string(),
            weight: z.number(),
            subsections: z.array(z.object({ ref: z.string(), weight: z.number() })),
        })
    ),
});

function normalizeWeights<T extends { weight: number }>(items: T[]): T[] {
    const sum = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
    return items.map((i) => ({ ...i, weight: sum > 0 ? Math.max(0, i.weight) / sum : 1 / items.length }));
}

/** Subtopic names must be unique within a topic; repeated subsection names ("Summary") get their pages added. */
function uniqueNames(entries: OutlineEntry[]): string[] {
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
    return entries.map((e) => ((counts.get(e.name) ?? 0) > 1 ? `${e.name} (pages ${e.pages[0]}–${e.pages[1]})` : e.name));
}

/**
 * Book-first subtopic planning for one section: each teacher topic is matched to book subsections, which become
 * its subtopics. Topics the book doesn't cover are returned in `unmatchedTopics` instead of being planned.
 */
export async function generateBookSectionSubtopics(
    section: ISection,
    bookId: string,
    context: {
        globalInstructions: string[];
        topicInstructions: TopicSpecificInstruction[];
        difficulty?: Difficulty | undefined;
        educationLevel?: EducationLevel | undefined;
    }
): Promise<{ topics: BookTopic[]; unmatchedTopics: string[] }> {
    return planSubtopicsFromOutline(section, await loadBookOutline(bookId), context);
}

export async function planSubtopicsFromOutline(
    section: ISection,
    outline: OutlineEntry[],
    context: Parameters<typeof generateBookSectionSubtopics>[2]
): Promise<{ topics: BookTopic[]; unmatchedTopics: string[] }> {
    const byRef = new Map(outline.map((e) => [e.ref, e]));

    const payload = {
        subject: section.subject,
        question_type: section.question_type,
        question_count: section.question_count,
        topics: section.topics,
        difficulty: context.difficulty ?? null,
        education_level: context.educationLevel?.value ?? null,
        global_instructions: context.globalInstructions,
        topic_specific_instructions: context.topicInstructions,
    };

    const output = await callStructured(
        BookSubtopicsZodSchema,
        "book_section_subtopics",
        BOOK_SUBTOPICS_PROMPT,
        `EXAM SECTION:\n${JSON.stringify(payload)}\n\nBOOK TABLE OF CONTENTS:\n${renderOutline(outline)}`
    );

    const outputByTopic = new Map(output.topics.map((t) => [normalize(t.topic), t]));
    const usedRefs = new Set<string>();
    const topics: BookTopic[] = [];
    const unmatchedTopics: string[] = [];

    for (const input of section.topics) {
        const name = topicName(input);
        const planned = outputByTopic.get(normalize(name));
        const chosen = (planned?.subsections ?? []).filter((s) => {
            const ref = s.ref.trim().replace(/^\[|\]$/g, "").toUpperCase();
            if (!byRef.has(ref) || usedRefs.has(ref)) return false;
            usedRefs.add(ref);
            s.ref = ref;
            return true;
        });
        if (chosen.length === 0) {
            unmatchedTopics.push(name);
            continue;
        }
        const entries = chosen.map((s) => byRef.get(s.ref)!);
        const names = uniqueNames(entries);
        topics.push({
            topic: name,
            weight: planned!.weight,
            subtopics: normalizeWeights(chosen.map((s, i) => ({ name: names[i]!, weight: s.weight, sourceNodeIds: [entries[i]!.nodeId] }))),
        });
    }

    return { topics: normalizeWeights(topics), unmatchedTopics };
}

const SubtopicMatchZodSchema = z.object({
    matches: z.array(z.object({ subtopic: z.string(), refs: z.array(z.string()) })),
});

/** Finds book subsections for subtopics that have none, e.g. ones a teacher added while reviewing the plan. */
export async function matchSubtopicsToBook(bookId: string, topic: string, subtopics: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (subtopics.length === 0) return result;
    const outline = await loadBookOutline(bookId);
    const byRef = new Map(outline.map((e) => [e.ref, e]));

    const output = await callStructured(
        SubtopicMatchZodSchema,
        "book_subtopic_match",
        `For each subtopic of an exam topic, choose the 1 to 3 book subsections whose content teaches it, citing them only by their reference such as "S12". If the book does not cover a subtopic, return an empty list for it. Never pick an unrelated subsection.`,
        `TOPIC: ${topic}\nSUBTOPICS: ${JSON.stringify(subtopics)}\n\nBOOK TABLE OF CONTENTS:\n${renderOutline(outline)}`
    );

    for (const match of output.matches) {
        const name = subtopics.find((s) => normalize(s) === normalize(match.subtopic));
        if (!name) continue;
        const ids = match.refs
            .map((r) => byRef.get(r.trim().replace(/^\[|\]$/g, "").toUpperCase())?.nodeId)
            .filter((id): id is string => !!id);
        result.set(name, [...new Set(ids)].slice(0, 3));
    }
    return result;
}

/**
 * The text each subtopic's questions are written from, split evenly across subtopics within `budgetChars`.
 * Images become "[Figure: caption]" since the writer only reads text.
 */
export async function loadSourceMaterial(
    subtopics: { name: string; sourceNodeIds: string[] }[],
    budgetChars = TOPIC_SOURCE_CHARS
): Promise<{ subtopic: string; text: string }[]> {
    const nodeIds = [...new Set(subtopics.flatMap((s) => s.sourceNodeIds))];
    if (nodeIds.length === 0) return [];

    const rows = await db.select({ nodeId: bookContents.nodeId, markdown: bookContents.markdown }).from(bookContents).where(inArray(bookContents.nodeId, nodeIds));
    const markdownByNode = new Map(rows.map((r) => [r.nodeId, r.markdown.replace(/!\[([^\]]*)\]\([^)]*\)(\n\*[^*\n]*\*)?/g, (_, caption) => `[Figure: ${caption || "untitled"}]`)]));

    const withSource = subtopics.filter((s) => s.sourceNodeIds.some((id) => markdownByNode.has(id)));
    const perSubtopic = Math.floor(budgetChars / Math.max(1, withSource.length));

    return withSource.map((s) => {
        const full = s.sourceNodeIds.map((id) => markdownByNode.get(id)).filter(Boolean).join("\n\n");
        return { subtopic: s.name, text: full.length > perSubtopic ? `${full.slice(0, perSubtopic)}\n[…]` : full };
    });
}
