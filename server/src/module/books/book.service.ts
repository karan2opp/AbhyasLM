import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import db from "../../common/db/index.js";
import { users } from "../users/user.schema.js";
import { books, bookBlocks, bookContents, bookImages, bookNodes, type BookProgress, type NewBookBlock } from "./book.schema.js";
import type { QuestionBankAccess } from "../question_bank/qdrant_client.js";

const INSERT_BATCH = 500;

export async function createBook(data: { title: string; fileUrl: string; createdBy: string }) {
    const [book] = await db.insert(books).values(data).returning();
    if (!book) throw new Error("Failed to create book");
    return book;
}

export async function getBook(id: string) {
    const [book] = await db.select().from(books).where(eq(books.id, id));
    return book ?? null;
}

/** The caller's own books — or, for an admin, everyone's, each with its uploader's email. The index itself is left out to keep the list light. */
export async function listAccessibleBooks(access: QuestionBankAccess) {
    return db
        .select({
            id: books.id,
            title: books.title,
            createdBy: books.createdBy,
            ownerEmail: users.email,
            status: books.status,
            progress: books.progress,
            pageCount: books.pageCount,
            error: books.error,
            createdAt: books.createdAt,
            updatedAt: books.updatedAt,
        })
        .from(books)
        .leftJoin(users, eq(books.createdBy, users.id))
        .where(access.role === "admin" ? undefined : eq(books.createdBy, access.userId))
        .orderBy(desc(books.createdAt));
}

export async function deleteBook(id: string) {
    const images = await db.select({ url: bookImages.url }).from(bookImages).where(eq(bookImages.bookId, id));
    await db.delete(books).where(eq(books.id, id));
    return images.map((i) => i.url);
}

export async function markBookProcessing(id: string) {
    await db.update(books).set({ status: "processing", error: null, updatedAt: new Date() }).where(eq(books.id, id));
}

export async function setBookProgress(id: string, progress: BookProgress, pageCount?: number) {
    await db
        .update(books)
        .set({ progress, ...(pageCount !== undefined ? { pageCount } : {}), updatedAt: new Date() })
        .where(eq(books.id, id));
}

export async function incrementWindowsDone(id: string) {
    await db
        .update(books)
        .set({
            progress: sql`jsonb_set(${books.progress}, '{windowsDone}', to_jsonb(coalesce((${books.progress}->>'windowsDone')::int, 0) + 1))`,
            updatedAt: new Date(),
        })
        .where(eq(books.id, id));
}

export async function markBookFailed(id: string, error: string) {
    await db.update(books).set({ status: "failed", error, updatedAt: new Date() }).where(eq(books.id, id));
}

export async function replaceBookBlocks(bookId: string, blocks: Omit<NewBookBlock, "id" | "bookId">[]) {
    await db.transaction(async (tx) => {
        await tx.delete(bookBlocks).where(eq(bookBlocks.bookId, bookId));
        for (let i = 0; i < blocks.length; i += INSERT_BATCH) {
            await tx.insert(bookBlocks).values(blocks.slice(i, i + INSERT_BATCH).map((b) => ({ ...b, bookId })));
        }
    });
}

export async function getBlocksByPages(bookId: string, pageFrom: number, pageTo: number) {
    return db
        .select()
        .from(bookBlocks)
        .where(and(eq(bookBlocks.bookId, bookId), gte(bookBlocks.page, pageFrom), lte(bookBlocks.page, pageTo)))
        .orderBy(asc(bookBlocks.seq));
}

export async function getAllBlocks(bookId: string) {
    return db.select().from(bookBlocks).where(eq(bookBlocks.bookId, bookId)).orderBy(asc(bookBlocks.seq));
}

export async function getSubsectionContent(bookId: string, nodeId: string) {
    const [node] = await db.select().from(bookNodes).where(and(eq(bookNodes.id, nodeId), eq(bookNodes.bookId, bookId)));
    if (!node || node.level !== "subsection") return null;
    const [content] = await db.select().from(bookContents).where(eq(bookContents.nodeId, nodeId));
    const images = await db.select().from(bookImages).where(eq(bookImages.nodeId, nodeId)).orderBy(asc(bookImages.position));
    return { node, markdown: content?.markdown ?? "", images };
}
