import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { users } from "../users/user.schema.js";

export interface QuestionBankImage {
    url: string;
    width: number | null;
    height: number | null;
    page: number;
}

export interface QuestionBankTable {
    page: number;
    header: string[] | null;
    rows: (string | null)[][];
}

export interface QuestionBankList {
    items: string[];
}

// One parsed MCQ choice. `label` is the marker as printed ("A", "ii", "3")
// and is stripped out of questionText; `text` is the choice itself, which is
// content, not noise — an MCQ is unanswerable without it. Every `text` here
// is verified to appear verbatim in the chunk's rawText before it is stored
// (see question_bank_classifier.ts), so options can never be invented.
export interface QuestionBankOption {
    label: string;
    text: string;
}

// One row per uploaded PYQ PDF. status tracks the async Inngest pipeline
// (extract -> chunk -> classify -> embed -> upsert) independently of the
// HTTP request that kicked it off. Owned directly by a user — no tenancy
// layer above that in this project.
export const questionBankDocuments = pgTable("question_bank_documents", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    createdBy: text("created_by").references(() => users.id).notNull(),
    title: text("title").notNull(),
    fileUrl: text("file_url").notNull(),
    status: text("status").$type<"pending" | "processing" | "completed" | "failed">().default("pending").notNull(),
    totalChunks: integer("total_chunks").default(0).notNull(),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// One row per extracted question. `id` is a UUID (not the usual cuid2 —
// Qdrant point IDs must be an unsigned integer or a UUID) and is reused
// verbatim as the Qdrant point ID, so a search hit's point ID IS this row's
// primary key — no separate mapping table needed. rawText/images/tables/lists
// are the verbatim extracted content (never model-generated); subject/topics/
// description are the one LLM-classified layer on top, and description is
// what actually gets embedded (see question_bank_classifier.ts).
export const questionBankChunks = pgTable("question_bank_chunks", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    documentId: text("document_id").references(() => questionBankDocuments.id, { onDelete: "cascade" }).notNull(),
    questionNumber: text("question_number"),
    // Verbatim extracted text, markers and all — the audit trail. Never
    // rewritten, never stripped; questionText below is the cleaned view.
    rawText: text("raw_text").notNull(),
    // The question stem alone: rawText minus the option lines and the answer
    // line, which are lifted out into `options`/`correctOption` instead.
    // Falls back to rawText when nothing could be parsed out.
    questionText: text("question_text"),
    options: jsonb("options").$type<QuestionBankOption[]>().default([]),
    // The answer key when the source paper prints one ("Answer: C") — stored
    // as the option label. Ground truth that can't be recovered any other way.
    correctOption: text("correct_option"),
    subject: text("subject"),
    topics: text("topics").array(),
    description: text("description"),
    pageStart: integer("page_start").notNull(),
    pageEnd: integer("page_end").notNull(),
    images: jsonb("images").$type<QuestionBankImage[]>().default([]),
    tables: jsonb("tables").$type<QuestionBankTable[]>().default([]),
    lists: jsonb("lists").$type<QuestionBankList[]>().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type QuestionBankDocument = typeof questionBankDocuments.$inferSelect;
export type NewQuestionBankDocument = typeof questionBankDocuments.$inferInsert;
export type QuestionBankChunk = typeof questionBankChunks.$inferSelect;
export type NewQuestionBankChunk = typeof questionBankChunks.$inferInsert;
