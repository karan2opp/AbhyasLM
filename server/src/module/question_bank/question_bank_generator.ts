import { inArray } from "drizzle-orm";
import db from "../../common/db/index.js";
import { questionBankChunks } from "./question_bank.schema.js";
import { distributeQuestionsAtLeastOne } from "../generation_agents/allocation.js";
import type { QuestionType, Difficulty } from "../generation_agents/Types/inputExam.js";
import { searchQuestionBank } from "./question_bank.service.js";
import type { QuestionBankAccess } from "./qdrant_client.js";

export type TopicTier = "high" | "mid" | "low";

// Priority tier -> relative weight when splitting the requested question
// count across topics. High-priority topics get proportionally more.
const TIER_WEIGHT: Record<TopicTier, number> = { high: 3, mid: 2, low: 1 };

// The search now narrows by document and question type itself, so everything
// it returns is already usable. The only reason to ask for any extra is that
// an earlier topic may have already claimed some of the same questions —
// hence a small cushion rather than the large one this needed when results
// were filtered after ranking.
const RETRIEVAL_OVERFETCH = 2;

export interface GenerateFromDocumentsInput {
    documentIds: string[];
    topics: { high: string[]; mid: string[]; low: string[] };
    // Accepted for request compatibility but unused: these questions are
    // returned exactly as they were printed, so there is nothing to set a
    // difficulty on. Kept so the existing form keeps working.
    difficulty: Difficulty;
    questionCount: number;
    questionType: QuestionType;
    marks: number;
}

export interface RetrievedQuestion {
    // The chunk's own id — stable, and the Qdrant point id for the same row.
    id: string;
    type: QuestionType;
    topic: string;
    question_text: string;
    marks: number;
    options?: string[];
    correct_option?: string;
    // Where this question actually came from, so a teacher can check it
    // against the original paper.
    source: {
        documentId: string;
        questionNumber: string | null;
        pageStart: number;
    };
}

export interface RetrievedTopicGroup {
    tier: TopicTier;
    topic: string;
    allocatedQuestions: number;
    questions: RetrievedQuestion[];
}

type ChunkRow = typeof questionBankChunks.$inferSelect;

const POSITIONAL_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/**
 * Maps one stored chunk onto the response shape. Options are returned as
 * plain strings in printed order and the answer becomes the POSITIONAL letter
 * of the correct option, because that is what the UI matches against — a
 * paper labelled (i)/(ii)/(iii) would otherwise never line up.
 */
function toRetrievedQuestion(chunk: ChunkRow, topic: string, marks: number): RetrievedQuestion {
    const options = chunk.options ?? [];
    const base = {
        id: chunk.id,
        topic,
        question_text: chunk.questionText || chunk.rawText,
        marks,
        source: {
            documentId: chunk.documentId,
            questionNumber: chunk.questionNumber,
            pageStart: chunk.pageStart,
        },
    };

    if (options.length === 0) {
        return { ...base, type: "descriptive" };
    }

    const answerIndex = chunk.correctOption
        ? options.findIndex((o) => o.label.toUpperCase() === chunk.correctOption!.toUpperCase())
        : -1;

    return {
        ...base,
        type: "mcq",
        options: options.map((o) => o.text),
        ...(answerIndex >= 0 && answerIndex < POSITIONAL_LABELS.length
            ? { correct_option: POSITIONAL_LABELS[answerIndex]! }
            : {}),
    };
}

/**
 * Retrieves the real questions for one topic: the topic is embedded and
 * matched against the bank's description vectors, then narrowed to the
 * selected documents, the requested question type, and anything not already
 * taken by an earlier topic.
 */
async function retrieveForTopic(
    topic: string,
    count: number,
    documentIds: string[],
    questionType: QuestionType,
    taken: Set<string>,
    access: QuestionBankAccess
): Promise<ChunkRow[]> {
    // Document and type are handed to the search rather than applied to its
    // results, so a hit can only fail here by having been claimed already.
    const hits = await searchQuestionBank(topic, access, {
        documentIds,
        questionType,
        limit: count * RETRIEVAL_OVERFETCH,
    });

    const picked: ChunkRow[] = [];
    for (const hit of hits) {
        if (picked.length >= count) break;
        if (taken.has(hit.chunk.id)) continue;
        picked.push(hit.chunk);
        taken.add(hit.chunk.id);
    }

    return picked;
}

/**
 * Returns REAL questions from the selected documents — exactly as they were
 * extracted, never rewritten — spread across the teacher's priority tiers
 * (high/mid/low get proportionally more/fewer of the total, see TIER_WEIGHT).
 *
 * Topics are free-typed, so matching is semantic rather than literal: each
 * topic is embedded and compared against the questions' descriptions, which
 * means "Newton's laws" still finds questions tagged "Laws of Motion". No
 * model writes anything here; the only model call is embedding the topic.
 *
 * A topic can come back short (or empty) when the selected documents simply
 * don't contain that many matching questions — `allocatedQuestions` is what
 * was asked for, `questions.length` is what actually existed.
 */
export async function generateQuestionsFromDocuments(
    input: GenerateFromDocumentsInput,
    access: QuestionBankAccess
): Promise<RetrievedTopicGroup[]> {
    if (input.documentIds.length === 0) throw new Error("At least one document must be selected");

    const tiered = (["high", "mid", "low"] as TopicTier[]).flatMap((tier) =>
        input.topics[tier].map((topic) => ({ tier, topic, weight: TIER_WEIGHT[tier] }))
    );
    if (tiered.length === 0) throw new Error("At least one topic must be assigned to a priority tier");

    const allocations = distributeQuestionsAtLeastOne(tiered, input.questionCount);

    // Sequential, not parallel: each topic has to see what earlier topics
    // already took, or the same question comes back under two topics.
    const taken = new Set<string>();
    const groups: RetrievedTopicGroup[] = [];

    for (const allocation of allocations) {
        if (allocation.allocatedQuestions <= 0) continue;

        const chunks = await retrieveForTopic(
            allocation.topic,
            allocation.allocatedQuestions,
            input.documentIds,
            input.questionType,
            taken,
            access
        );

        groups.push({
            tier: allocation.tier,
            topic: allocation.topic,
            allocatedQuestions: allocation.allocatedQuestions,
            questions: chunks.map((chunk) => toRetrievedQuestion(chunk, allocation.topic, input.marks)),
        });
    }

    return groups;
}

/**
 * Every question in the selected documents, unfiltered — the fallback for a
 * caller that wants the whole bank rather than a topic-weighted selection.
 */
export async function listQuestionsForDocuments(documentIds: string[], marks: number): Promise<RetrievedQuestion[]> {
    if (documentIds.length === 0) return [];
    const rows = await db.select().from(questionBankChunks).where(inArray(questionBankChunks.documentId, documentIds));
    return rows.map((row) => toRetrievedQuestion(row, (row.topics ?? [])[0] ?? "General", marks));
}
