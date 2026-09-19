import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pLimit from "p-limit";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import db from "../../common/db/index.js";
import { extractBookPdf } from "../../common/pdf/pdf_python_bridge.js";
import { uploadToCloudinary } from "../../common/config/cloudinary.js";
import { books, bookContents, bookImages, bookNodes, type BookToc, type BookTocChapter } from "./book.schema.js";
import { buildBookBlocks, scannedPageRatio } from "./book_blocks.js";
import { indexWindow, planWindows, type BookWindow, type IndexBlock, type WindowResult } from "./book_windows.js";
import { buildTree, mergeWindowResults, subsectionMarkdown } from "./book_index_builder.js";
import {
    getAllBlocks,
    getBlocksByPages,
    getBook,
    incrementWindowsDone,
    markBookProcessing,
    replaceBookBlocks,
    setBookProgress,
} from "./book.service.js";

const IMAGE_UPLOAD_CONCURRENCY = 5;
const MAX_SCANNED_RATIO = 0.3;
// Context pages loaded around a window; the window indexer trims them to its character budget.
const CONTEXT_PAGES = 2;
const INSERT_BATCH = 500;

/** Thrown for problems with the uploaded file itself, which retrying can't fix. */
export class BookInputError extends Error {}

async function downloadToFile(url: string, destPath: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download PDF (${response.status} ${response.statusText})`);
    await fs.writeFile(destPath, Buffer.from(await response.arrayBuffer()));
}

/** Step 1: download, extract, build numbered blocks, upload figures, store blocks, and plan the windows. */
export async function extractAndStoreBlocks(bookId: string, localPdfPath?: string): Promise<{ pageCount: number; blockCount: number; windows: BookWindow[] }> {
    const book = await getBook(bookId);
    if (!book) throw new BookInputError(`Book ${bookId} not found`);
    await markBookProcessing(bookId);
    await setBookProgress(bookId, { stage: "extracting", windowsDone: 0, windowsTotal: 0 });

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "book-"));
    try {
        const pdfPath = localPdfPath ?? path.join(workDir, "input.pdf");
        if (!localPdfPath) await downloadToFile(book.fileUrl, pdfPath);

        const extracted = await extractBookPdf(pdfPath, path.join(workDir, "out"));
        if (scannedPageRatio(extracted) > MAX_SCANNED_RATIO) {
            throw new BookInputError("This looks like a scanned PDF. Only PDFs with selectable text are supported for now.");
        }

        const blocks = buildBookBlocks(extracted);
        if (blocks.length === 0) throw new BookInputError("No readable text was found in this PDF.");

        const limit = pLimit(IMAGE_UPLOAD_CONCURRENCY);
        const uploaded = new Map<string, string>();
        const imagePaths = [...new Set(blocks.map((b) => b.imagePath).filter((p): p is string => !!p))];
        await Promise.all(
            imagePaths.map((imagePath) =>
                limit(async () => {
                    const result = await uploadToCloudinary(await fs.readFile(imagePath), `books/${bookId}/images`);
                    uploaded.set(imagePath, result.url);
                })
            )
        );

        await replaceBookBlocks(
            bookId,
            blocks.map(({ imagePath, ...block }) => ({ ...block, imageUrl: imagePath ? uploaded.get(imagePath) ?? null : null }))
        );

        const windows = planWindows(blocks);
        await setBookProgress(bookId, { stage: "indexing", windowsDone: 0, windowsTotal: windows.length }, extracted.pageCount);
        console.log(`[books] ${bookId}: ${extracted.pageCount} pages, ${blocks.length} blocks, ${imagePaths.length} images, ${windows.length} windows`);
        return { pageCount: extracted.pageCount, blockCount: blocks.length, windows };
    } finally {
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
}

type StoredBlock = IndexBlock & { imageUrl: string | null; imageWidth: number | null; imageHeight: number | null };

const toIndexBlock = (b: Awaited<ReturnType<typeof getAllBlocks>>[number]): StoredBlock => ({
    seq: b.seq,
    page: b.page,
    type: b.type,
    text: b.text,
    fontSize: b.fontSize,
    bold: b.bold,
    headingLevelHint: b.headingLevelHint,
    headingSource: b.headingSource,
    imageUrl: b.imageUrl,
    imageWidth: b.imageWidth,
    imageHeight: b.imageHeight,
});

/** Step 2 (one per window, run in parallel): index a 10-page window with read-only context around it. */
export async function indexBookWindow(bookId: string, window: BookWindow): Promise<WindowResult> {
    const blocks = await getBlocksByPages(bookId, window.pageStart - CONTEXT_PAGES, window.pageEnd + CONTEXT_PAGES);
    const result = await indexWindow(window, blocks.map(toIndexBlock));
    await incrementWindowsDone(bookId);
    return result;
}

/** Step 3: merge window results, build the tree, and save nodes, contents, images and the index JSON. */
export async function mergeAndSaveIndex(bookId: string, results: WindowResult[]): Promise<BookToc> {
    const book = await getBook(bookId);
    if (!book) throw new BookInputError(`Book ${bookId} not found`);
    const progress = { windowsDone: results.length, windowsTotal: results.length };
    await setBookProgress(bookId, { stage: "merging", ...progress });

    const blocksBySeq = new Map((await getAllBlocks(bookId)).map((b) => [b.seq, toIndexBlock(b)]));
    const { subsections, headingLevels } = await mergeWindowResults(results, blocksBySeq);
    const tree = await buildTree(subsections, headingLevels, blocksBySeq, book.title);

    await setBookProgress(bookId, { stage: "saving", ...progress });

    const pageOf = (seq: number) => blocksBySeq.get(seq)?.page ?? 0;
    const nodeRows: (typeof bookNodes.$inferInsert)[] = [];
    const contentRows: (typeof bookContents.$inferInsert)[] = [];
    const imageRows: (typeof bookImages.$inferInsert)[] = [];
    const tocChapters: BookTocChapter[] = [];
    let position = 0;

    for (const chapter of tree) {
        const chapterSubs = chapter.sections.flatMap((s) => s.subsections);
        const chapterStart = chapterSubs[0]!.startBlock;
        const chapterEnd = chapterSubs[chapterSubs.length - 1]!.endBlock;
        const chapterId = createId();
        nodeRows.push({
            id: chapterId, bookId, parentId: null, level: "chapter", position: position++,
            title: chapter.title, titleGenerated: chapter.titleGenerated,
            pageStart: pageOf(chapterStart), pageEnd: pageOf(chapterEnd), startBlock: chapterStart, endBlock: chapterEnd,
        });
        const tocChapter: BookTocChapter = {
            id: chapterId, title: chapter.title, titleGenerated: chapter.titleGenerated,
            pages: [pageOf(chapterStart), pageOf(chapterEnd)], sections: [],
        };

        for (const section of chapter.sections) {
            const sectionStart = section.subsections[0]!.startBlock;
            const sectionEnd = section.subsections[section.subsections.length - 1]!.endBlock;
            const sectionId = createId();
            nodeRows.push({
                id: sectionId, bookId, parentId: chapterId, level: "section", position: position++,
                title: section.title, titleGenerated: section.titleGenerated,
                pageStart: pageOf(sectionStart), pageEnd: pageOf(sectionEnd), startBlock: sectionStart, endBlock: sectionEnd,
            });
            const tocSection = {
                id: sectionId, heading: section.title, headingGenerated: section.titleGenerated,
                pages: [pageOf(sectionStart), pageOf(sectionEnd)] as [number, number], subsections: [] as BookTocChapter["sections"][number]["subsections"],
            };

            for (const sub of section.subsections) {
                const subId = createId();
                const contentId = createId();
                nodeRows.push({
                    id: subId, bookId, parentId: sectionId, level: "subsection", position: position++,
                    title: sub.name, titleGenerated: sub.nameGenerated, description: sub.description, keyConcepts: sub.keyConcepts,
                    pageStart: pageOf(sub.startBlock), pageEnd: pageOf(sub.endBlock), startBlock: sub.startBlock, endBlock: sub.endBlock,
                });
                contentRows.push({ id: contentId, bookId, nodeId: subId, markdown: subsectionMarkdown(sub.startBlock, sub.endBlock, blocksBySeq, headingLevels) });

                const imageIds: string[] = [];
                let imagePosition = 0;
                for (let seq = sub.startBlock; seq <= sub.endBlock; seq++) {
                    const block = blocksBySeq.get(seq);
                    if (block?.type !== "image" || !block.imageUrl) continue;
                    const imageId = createId();
                    imageIds.push(imageId);
                    imageRows.push({
                        id: imageId, bookId, nodeId: subId, position: ++imagePosition, blockSeq: seq, page: block.page,
                        caption: block.text || null, url: block.imageUrl, width: block.imageWidth, height: block.imageHeight,
                    });
                }

                tocSection.subsections.push({
                    id: subId, name: sub.name, nameGenerated: sub.nameGenerated, description: sub.description,
                    keyConcepts: sub.keyConcepts, contentId, imageIds, pages: [pageOf(sub.startBlock), pageOf(sub.endBlock)],
                });
            }
            tocChapter.sections.push(tocSection);
        }
        tocChapters.push(tocChapter);
    }

    const toc: BookToc = { bookId, title: book.title, chapters: tocChapters };

    await db.transaction(async (tx) => {
        // Contents and images cascade from nodes, so re-running this step replaces the previous index cleanly.
        await tx.delete(bookNodes).where(eq(bookNodes.bookId, bookId));
        for (let i = 0; i < nodeRows.length; i += INSERT_BATCH) await tx.insert(bookNodes).values(nodeRows.slice(i, i + INSERT_BATCH));
        for (let i = 0; i < contentRows.length; i += INSERT_BATCH) await tx.insert(bookContents).values(contentRows.slice(i, i + INSERT_BATCH));
        for (let i = 0; i < imageRows.length; i += INSERT_BATCH) await tx.insert(bookImages).values(imageRows.slice(i, i + INSERT_BATCH));
        await tx
            .update(books)
            .set({ toc, status: "completed", error: null, progress: { stage: "saving", ...progress }, updatedAt: new Date() })
            .where(eq(books.id, bookId));
    });

    console.log(`[books] ${bookId}: indexed ${tree.length} chapters, ${contentRows.length} subsections, ${imageRows.length} images`);
    return toc;
}
