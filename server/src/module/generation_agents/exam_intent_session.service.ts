import { and, eq, asc, desc, sql } from "drizzle-orm";
import db from "../../common/db/index.js";
import { users } from "../users/user.schema.js";
import { examIntentSessions, examIntentMessages, blueprintReviewMessages, questionReviewMessages } from "./exam_intent_session.schema.js";
import type { IInputExam } from "./Types/inputExam.js";
import type { ConversationSummary, ConversationTurn } from "./Types/outputConversation.js";
import type { ExamBlueprint } from "./Types/outputSubtopics.js";
import type { GeneratedExam, GeneratedSectionQuestions } from "./Types/outputGeneration.js";

export const createSession = async (examInput: IInputExam, createdBy: string) => {
    const [session] = await db
        .insert(examIntentSessions)
        .values({ examInput, createdBy })
        .returning();
    return session!;
};

/**
 * The caller's sessions, newest first — or, for an admin, everyone's — just
 * enough to list them, without the large JSON columns. The owner's email is
 * only meaningful (and only shown by the client) when an admin is looking at
 * someone else's session. Search matches the title stored inside the
 * examInput JSON column (there's no separate title column); pagination and
 * the total count both run server-side so the client never has to fetch
 * every session to filter or page through them.
 */
export const listSessions = async (
    requester: { id: string; role: string | null },
    options: { search?: string | undefined; page?: number | undefined; pageSize?: number | undefined } = {}
) => {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, options.pageSize ?? 12));
    const search = options.search?.trim();

    const conditions = [
        requester.role === "admin" ? undefined : eq(examIntentSessions.createdBy, requester.id),
        search ? sql`${examIntentSessions.examInput}->>'title' ilike ${`%${search}%`}` : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countRows] = await Promise.all([
        db
            .select({
                id: examIntentSessions.id,
                examInput: examIntentSessions.examInput,
                status: examIntentSessions.status,
                blueprintStatus: examIntentSessions.blueprintStatus,
                questionsStatus: examIntentSessions.questionsStatus,
                createdBy: examIntentSessions.createdBy,
                ownerEmail: users.email,
                createdAt: examIntentSessions.createdAt,
                updatedAt: examIntentSessions.updatedAt,
            })
            .from(examIntentSessions)
            .leftJoin(users, eq(examIntentSessions.createdBy, users.id))
            .where(where)
            .orderBy(desc(examIntentSessions.createdAt))
            .limit(pageSize)
            .offset((page - 1) * pageSize),
        db.select({ count: sql<number>`count(*)::int` }).from(examIntentSessions).where(where),
    ]);

    return {
        sessions: rows.map(({ examInput, ...row }) => ({
            ...row,
            title: examInput.title || null,
            sectionCount: examInput.sections.length,
            bookId: examInput.bookId ?? null,
        })),
        total: countRows[0]!.count,
        page,
        pageSize,
    };
};

export const getSession = async (sessionId: string) => {
    const [session] = await db.select().from(examIntentSessions).where(eq(examIntentSessions.id, sessionId));
    return session ?? null;
};

export const getSessionHistory = async (sessionId: string): Promise<ConversationTurn[]> => {
    const rows = await db
        .select()
        .from(examIntentMessages)
        .where(eq(examIntentMessages.sessionId, sessionId))
        .orderBy(asc(examIntentMessages.createdAt));
    return rows.map((r) => ({ role: r.role, content: r.content }));
};

export const appendMessage = async (sessionId: string, role: "user" | "assistant", content: string) => {
    await db.insert(examIntentMessages).values({ sessionId, role, content });
};

export const completeSession = async (sessionId: string, summary: ConversationSummary) => {
    await db
        .update(examIntentSessions)
        .set({ status: "completed", summary, updatedAt: new Date() })
        .where(eq(examIntentSessions.id, sessionId));
};

export const setBlueprintInProgress = async (sessionId: string) => {
    await db
        .update(examIntentSessions)
        .set({ blueprintStatus: "in_progress", blueprintError: null, updatedAt: new Date() })
        .where(eq(examIntentSessions.id, sessionId));
};

export const saveBlueprint = async (sessionId: string, blueprint: ExamBlueprint) => {
    await db
        .update(examIntentSessions)
        .set({ blueprintStatus: "completed", blueprint, updatedAt: new Date() })
        .where(eq(examIntentSessions.id, sessionId));
};

export const markBlueprintFailed = async (sessionId: string, error: string) => {
    await db
        .update(examIntentSessions)
        .set({ blueprintStatus: "failed", blueprintError: error, updatedAt: new Date() })
        .where(eq(examIntentSessions.id, sessionId));
};

// Persists the Blueprint Review Agent's mutated blueprint after every turn
// (not just on completion) — so a page refresh or the next turn always
// resumes from exactly what the last set of tool calls produced.
export const updateBlueprint = async (sessionId: string, blueprint: ExamBlueprint) => {
    await db
        .update(examIntentSessions)
        .set({ blueprint, updatedAt: new Date() })
        .where(eq(examIntentSessions.id, sessionId));
};

export const getReviewHistory = async (sessionId: string): Promise<ConversationTurn[]> => {
    const rows = await db
        .select()
        .from(blueprintReviewMessages)
        .where(eq(blueprintReviewMessages.sessionId, sessionId))
        .orderBy(asc(blueprintReviewMessages.createdAt));
    return rows.map((r) => ({ role: r.role, content: r.content }));
};

// ── Question Review Agent transcript ─────────────────────────────────────────
// Capped on read: a long review can accumulate many turns, and the whole
// transcript is replayed into the model on every turn. The most recent turns
// are the ones that carry the context ("now make it harder").
const QUESTION_REVIEW_HISTORY_LIMIT = 20;

export const getQuestionReviewHistory = async (sessionId: string): Promise<ConversationTurn[]> => {
    const rows = await db
        .select()
        .from(questionReviewMessages)
        .where(eq(questionReviewMessages.sessionId, sessionId))
        .orderBy(desc(questionReviewMessages.createdAt))
        .limit(QUESTION_REVIEW_HISTORY_LIMIT);
    // Newest-first above so the limit keeps the RECENT turns; flipped back to
    // chronological order here, which is what the model expects.
    return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
};

export const appendQuestionReviewMessage = async (sessionId: string, role: "user" | "assistant", content: string) => {
    await db.insert(questionReviewMessages).values({ sessionId, role, content });
};

export const appendReviewMessage = async (sessionId: string, role: "user" | "assistant", content: string) => {
    await db.insert(blueprintReviewMessages).values({ sessionId, role, content });
};

export const setQuestionsInProgress = async (sessionId: string) => {
    await db
        .update(examIntentSessions)
        .set({ questionsStatus: "in_progress", questionsError: null, questions: null, updatedAt: new Date() })
        .where(eq(examIntentSessions.id, sessionId));
};

// Upserts one section's generated questions into the session's running
// `questions` tree, replacing any previous result for that same section
// name. Sections are always generated one at a time (never concurrently),
// so there's no concurrent-writer race to guard against here.
export const saveSectionQuestions = async (sessionId: string, section: GeneratedSectionQuestions) => {
    const session = await getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const existing: GeneratedExam = session.questions || { sections: [] };
    const sections = [...existing.sections.filter((s) => s.name !== section.name), section];

    await db
        .update(examIntentSessions)
        .set({ questions: { sections }, updatedAt: new Date() })
        .where(eq(examIntentSessions.id, sessionId));
};

// Replaces the whole stored question tree — the Question Review Agent's
// edits land here, since this project has no separate question tables.
export const updateQuestions = async (sessionId: string, questions: GeneratedExam) => {
    await db
        .update(examIntentSessions)
        .set({ questions, updatedAt: new Date() })
        .where(eq(examIntentSessions.id, sessionId));
};

export const markQuestionsCompleted = async (sessionId: string) => {
    await db
        .update(examIntentSessions)
        .set({ questionsStatus: "completed", updatedAt: new Date() })
        .where(eq(examIntentSessions.id, sessionId));
};

export const markQuestionsFailed = async (sessionId: string, error: string) => {
    await db
        .update(examIntentSessions)
        .set({ questionsStatus: "failed", questionsError: error, updatedAt: new Date() })
        .where(eq(examIntentSessions.id, sessionId));
};
