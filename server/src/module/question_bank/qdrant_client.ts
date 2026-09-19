import { QdrantClient } from "@qdrant/js-client-rest";

// Prefixed so this project's collection never collides with anything else
// that might share the same Qdrant cluster during local development.
export const QUESTION_BANK_COLLECTION = "abhyaslm_question_bank_chunks";
// text-embedding-3-small's native output size.
export const QUESTION_BANK_VECTOR_SIZE = 1536;

let client: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
    if (client) return client;
    const url = process.env.QDRANT_URL;
    if (!url) throw new Error("QDRANT_URL is not set in the environment variables.");
    const apiKey = process.env.QDRANT_API_KEY;
    client = new QdrantClient({ url, ...(apiKey ? { apiKey } : {}) });
    return client;
}

let collectionReady = false;

/**
 * Creates the question-bank collection and its payload indexes if they don't
 * already exist. Safe to call on every request — cheap no-op once the
 * collection exists (memoized per process so it isn't re-checked every call).
 */
export async function ensureQuestionBankCollection(): Promise<void> {
    if (collectionReady) return;
    const qdrant = getQdrantClient();

    const exists = await qdrant.collectionExists(QUESTION_BANK_COLLECTION);
    if (!exists.exists) {
        await qdrant.createCollection(QUESTION_BANK_COLLECTION, {
            vectors: { size: QUESTION_BANK_VECTOR_SIZE, distance: "Cosine" },
        });
    }

    for (const field of ["subject", "topics", "documentId", "createdBy", "questionType"]) {
        try {
            await qdrant.createPayloadIndex(QUESTION_BANK_COLLECTION, {
                field_name: field,
                field_schema: "keyword",
            });
        } catch {
            // Index already exists — fine, this call is only ever needed once.
        }
    }

    collectionReady = true;
}

export interface QuestionBankPointPayload {
    documentId: string;
    // Denormalized from the owning document so access can be decided inside
    // the vector search itself — Qdrant can't join back to Postgres, and
    // filtering after the fact would silently shrink the result set below the
    // requested limit.
    createdBy: string;
    subject: string;
    topics: string[];
    questionNumber: string | null;
    // Multiple-choice or written-answer. Stored so the search can narrow by
    // type itself — otherwise the wrong type comes back ranked and has to be
    // thrown away afterwards, which quietly returns fewer questions than asked.
    questionType: "mcq" | "descriptive";
    hasImages: boolean;
    hasTables: boolean;
}

// Who is asking. No organisation concept in this project — access is
// "mine," unless the requester is an admin, who may reach anyone's.
export interface QuestionBankAccess {
    userId: string;
    role: string | null;
}

export async function upsertQuestionBankPoints(
    points: { id: string; vector: number[]; payload: QuestionBankPointPayload }[]
): Promise<void> {
    if (points.length === 0) return;
    await ensureQuestionBankCollection();
    const qdrant = getQdrantClient();
    await qdrant.upsert(QUESTION_BANK_COLLECTION, {
        wait: true,
        points: points.map((p) => ({ id: p.id, vector: p.vector, payload: p.payload as unknown as Record<string, unknown> })),
    });
}

export async function deleteQuestionBankPointsByDocument(documentId: string): Promise<void> {
    await ensureQuestionBankCollection();
    const qdrant = getQdrantClient();
    await qdrant.delete(QUESTION_BANK_COLLECTION, {
        wait: true,
        filter: { must: [{ key: "documentId", match: { value: documentId } }] },
    });
}

export interface QuestionBankSearchHit {
    id: string;
    score: number;
    payload: QuestionBankPointPayload;
}

export async function searchQuestionBankPoints(
    vector: number[],
    access: QuestionBankAccess,
    options: {
        subject?: string;
        topics?: string[];
        // Restrict to specific documents (the papers ticked) and/or one
        // question type. Both are applied INSIDE the search so every hit
        // returned is already usable — narrowing afterwards would mean asking
        // for far more than needed and still coming up short.
        documentIds?: string[];
        questionType?: "mcq" | "descriptive";
        limit?: number;
    } = {}
): Promise<QuestionBankSearchHit[]> {
    await ensureQuestionBankCollection();
    const qdrant = getQdrantClient();

    // Admins search across everyone's chunks; everyone else, only their own.
    const must: Record<string, unknown>[] = access.role === "admin" ? [] : [{ key: "createdBy", match: { value: access.userId } }];
    if (options.subject) must.push({ key: "subject", match: { value: options.subject } });
    if (options.topics && options.topics.length > 0) must.push({ key: "topics", match: { any: options.topics } });
    if (options.documentIds && options.documentIds.length > 0) {
        must.push({ key: "documentId", match: { any: options.documentIds } });
    }
    if (options.questionType) must.push({ key: "questionType", match: { value: options.questionType } });

    const result = await qdrant.query(QUESTION_BANK_COLLECTION, {
        query: vector,
        limit: options.limit ?? 10,
        with_payload: true,
        filter: { must },
    });

    return result.points.map((point) => ({
        id: String(point.id),
        score: point.score,
        payload: point.payload as unknown as QuestionBankPointPayload,
    }));
}
