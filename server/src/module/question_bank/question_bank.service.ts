import { eq, inArray, desc } from "drizzle-orm";
import db from "../../common/db/index.js";
import { questionBankDocuments, questionBankChunks, type NewQuestionBankChunk } from "./question_bank.schema.js";
import { getClientForModel } from "../../common/agent/openai.client.js";
import { env } from "../../env.js";
import { searchQuestionBankPoints, type QuestionBankAccess } from "./qdrant_client.js";

export async function createDocument(input: {
    title: string;
    fileUrl: string;
    createdBy: string;
}) {
    const [doc] = await db
        .insert(questionBankDocuments)
        .values({
            title: input.title,
            fileUrl: input.fileUrl,
            createdBy: input.createdBy,
            status: "pending",
        })
        .returning();
    return doc!;
}

export async function getDocument(id: string) {
    const [doc] = await db.select().from(questionBankDocuments).where(eq(questionBankDocuments.id, id));
    return doc ?? null;
}

export async function getDocumentsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return db.select().from(questionBankDocuments).where(inArray(questionBankDocuments.id, ids));
}

export async function listAccessibleDocuments(access: QuestionBankAccess) {
    return db
        .select()
        .from(questionBankDocuments)
        .where(eq(questionBankDocuments.createdBy, access.userId))
        .orderBy(desc(questionBankDocuments.createdAt));
}

/** The single source of truth for "may this person use this document?". */
export function canAccessDocument(document: { createdBy: string }, access: QuestionBankAccess): boolean {
    return document.createdBy === access.userId;
}

export async function markDocumentProcessing(id: string) {
    await db.update(questionBankDocuments).set({ status: "processing", updatedAt: new Date() }).where(eq(questionBankDocuments.id, id));
}

export async function markDocumentCompleted(id: string, totalChunks: number) {
    await db.update(questionBankDocuments).set({ status: "completed", totalChunks, updatedAt: new Date() }).where(eq(questionBankDocuments.id, id));
}

export async function markDocumentFailed(id: string, error: string) {
    await db.update(questionBankDocuments).set({ status: "failed", error, updatedAt: new Date() }).where(eq(questionBankDocuments.id, id));
}

export async function renameDocument(id: string, title: string) {
    const [doc] = await db
        .update(questionBankDocuments)
        .set({ title, updatedAt: new Date() })
        .where(eq(questionBankDocuments.id, id))
        .returning();
    return doc ?? null;
}

export async function getChunksByDocument(documentId: string) {
    return db.select().from(questionBankChunks).where(eq(questionBankChunks.documentId, documentId));
}

// Cascades to questionBankChunks at the DB level (onDelete: "cascade") — the
// caller is responsible for cleaning up Qdrant points and Cloudinary assets
// BEFORE calling this, since those aren't reachable once the rows are gone.
export async function deleteDocument(id: string) {
    await db.delete(questionBankDocuments).where(eq(questionBankDocuments.id, id));
}

export async function saveChunk(chunk: NewQuestionBankChunk) {
    const [row] = await db.insert(questionBankChunks).values(chunk).returning();
    return row!;
}

/**
 * Embeds a single string with the configured embedding model. Used only on
 * `description` (see question_bank_classifier.ts) — never on the raw
 * question text directly, since the description is the searchable gloss.
 */
export async function embedText(text: string): Promise<number[]> {
    const client = await getClientForModel(env.EMBEDDING_MODEL);
    const response = await client.embeddings.create({ model: env.EMBEDDING_MODEL, input: text });
    const embedding = response.data[0]?.embedding;
    if (!embedding) throw new Error("Embedding response contained no vector");
    return embedding;
}

export interface QuestionBankSearchResult {
    score: number;
    chunk: typeof questionBankChunks.$inferSelect;
}

/**
 * Semantic search over the question bank: embeds the query, searches Qdrant
 * for nearest chunks (optionally filtered), then loads the full verbatim
 * chunk rows from Postgres — Qdrant only ever holds the vector + filterable
 * metadata, never the content itself. Result order follows Qdrant's
 * similarity ranking, not Postgres's default order.
 */
export async function searchQuestionBank(
    queryText: string,
    access: QuestionBankAccess,
    options: {
        subject?: string;
        topics?: string[];
        documentIds?: string[];
        questionType?: "mcq" | "descriptive";
        limit?: number;
    } = {}
): Promise<QuestionBankSearchResult[]> {
    const vector = await embedText(queryText);
    const hits = await searchQuestionBankPoints(vector, access, options);
    if (hits.length === 0) return [];

    const rows = await db.select().from(questionBankChunks).where(inArray(questionBankChunks.id, hits.map((h) => h.id)));
    const byId = new Map(rows.map((row) => [row.id, row]));

    return hits
        .map((hit) => {
            const chunk = byId.get(hit.id);
            return chunk ? { score: hit.score, chunk } : null;
        })
        .filter((r): r is QuestionBankSearchResult => r !== null);
}
