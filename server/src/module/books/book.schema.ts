import { pgTable, text, integer, timestamp, jsonb, boolean, real, unique, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { users } from "../users/user.schema.js";

export type BookStatus = "pending" | "processing" | "completed" | "failed";
export type BookStage = "extracting" | "indexing" | "merging" | "saving";

export interface BookProgress {
    stage: BookStage;
    windowsDone: number;
    windowsTotal: number;
}

export type BookBlockType = "heading" | "paragraph" | "list" | "table" | "image" | "code";
// Where a heading's level came from. Bookmarks and the printed contents page are exact; font is a guess.
export type BookHeadingSource = "bookmark" | "contents" | "font";
export const isExactHeadingSource = (source: BookHeadingSource | null | undefined) => source === "bookmark" || source === "contents";
export type BookNodeLevel = "chapter" | "section" | "subsection";

export interface BookTocSubsection {
    id: string;
    name: string;
    nameGenerated: boolean;
    description: string;
    keyConcepts: string[];
    contentId: string;
    imageIds: string[];
    pages: [number, number];
}

export interface BookTocSection {
    id: string;
    heading: string;
    headingGenerated: boolean;
    pages: [number, number];
    subsections: BookTocSubsection[];
}

export interface BookTocChapter {
    id: string;
    title: string;
    titleGenerated: boolean;
    pages: [number, number];
    sections: BookTocSection[];
}

export interface BookToc {
    bookId: string;
    title: string;
    chapters: BookTocChapter[];
}

// Owned by the uploader, same as question-bank documents. No sharing.
export const books = pgTable("books", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    createdBy: text("created_by").references(() => users.id).notNull(),
    title: text("title").notNull(),
    fileUrl: text("file_url").notNull(),
    status: text("status").$type<BookStatus>().default("pending").notNull(),
    progress: jsonb("progress").$type<BookProgress>(),
    pageCount: integer("page_count"),
    toc: jsonb("toc").$type<BookToc>(),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// The book cut into numbered pieces in reading order. Every later step (windows, merge, content) refers to `seq`.
export const bookBlocks = pgTable("book_blocks", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    bookId: text("book_id").references(() => books.id, { onDelete: "cascade" }).notNull(),
    seq: integer("seq").notNull(),
    page: integer("page").notNull(),
    type: text("type").$type<BookBlockType>().notNull(),
    // Paragraph/heading text as extracted; lists and tables as markdown; an image's caption.
    text: text("text").notNull(),
    fontSize: real("font_size"),
    bold: boolean("bold").default(false).notNull(),
    // 1 chapter, 2 section, 3 subsection. Only a hint until indexing confirms it, except bookmark-sourced levels.
    headingLevelHint: integer("heading_level_hint"),
    headingSource: text("heading_source").$type<BookHeadingSource>(),
    imageUrl: text("image_url"),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
}, (table) => [
    unique("book_blocks_book_seq_unique").on(table.bookId, table.seq),
]);

export const bookNodes = pgTable("book_nodes", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    bookId: text("book_id").references(() => books.id, { onDelete: "cascade" }).notNull(),
    parentId: text("parent_id").references((): AnyPgColumn => bookNodes.id, { onDelete: "cascade" }),
    level: text("level").$type<BookNodeLevel>().notNull(),
    // Global reading order across the whole tree, assigned once when the index is saved.
    position: integer("position").notNull(),
    title: text("title").notNull(),
    // True when the title was written by the AI rather than taken from the book's own heading.
    titleGenerated: boolean("title_generated").default(false).notNull(),
    description: text("description"),
    keyConcepts: text("key_concepts").array(),
    pageStart: integer("page_start").notNull(),
    pageEnd: integer("page_end").notNull(),
    startBlock: integer("start_block").notNull(),
    endBlock: integer("end_block").notNull(),
}, (table) => [
    index("book_nodes_book_position_idx").on(table.bookId, table.position),
]);

// A subsection's full content as markdown. Kept apart from book_nodes so loading the index never pulls book text.
export const bookContents = pgTable("book_contents", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    bookId: text("book_id").references(() => books.id, { onDelete: "cascade" }).notNull(),
    nodeId: text("node_id").references(() => bookNodes.id, { onDelete: "cascade" }).notNull().unique(),
    markdown: text("markdown").notNull(),
});

export const bookImages = pgTable("book_images", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    bookId: text("book_id").references(() => books.id, { onDelete: "cascade" }).notNull(),
    // The subsection the image sits in; its section and chapter come from the parent chain.
    nodeId: text("node_id").references(() => bookNodes.id, { onDelete: "cascade" }).notNull(),
    position: integer("position").notNull(),
    blockSeq: integer("block_seq").notNull(),
    page: integer("page").notNull(),
    caption: text("caption"),
    url: text("url").notNull(),
    width: integer("width"),
    height: integer("height"),
}, (table) => [
    index("book_images_node_idx").on(table.nodeId),
]);

export type Book = typeof books.$inferSelect;
export type BookBlock = typeof bookBlocks.$inferSelect;
export type NewBookBlock = typeof bookBlocks.$inferInsert;
export type BookNode = typeof bookNodes.$inferSelect;
