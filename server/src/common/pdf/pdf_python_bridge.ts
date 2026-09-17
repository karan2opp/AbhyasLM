import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const ExtractedImageZodSchema = z.object({
    index: z.number(),
    xref: z.number(),
    ext: z.string(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    path: z.string(),
    bbox: z.array(z.number()).nullable(),
});

const ExtractedLineZodSchema = z.object({
    text: z.string(),
    bbox: z.array(z.number()),
});

const ExtractedTableZodSchema = z.object({
    bbox: z.array(z.number()),
    header: z.array(z.string()).nullable(),
    rows: z.array(z.array(z.string().nullable())),
});

const ExtractedListZodSchema = z.object({
    items: z.array(z.string()),
});

const ExtractedPageZodSchema = z.object({
    page: z.number(),
    hasTextLayer: z.boolean(),
    text: z.string(),
    lists: z.array(ExtractedListZodSchema),
    tables: z.array(ExtractedTableZodSchema),
    images: z.array(ExtractedImageZodSchema),
    lines: z.array(ExtractedLineZodSchema),
    renderPath: z.string().nullable(),
});

const ExtractPdfResultZodSchema = z.object({
    pages: z.array(ExtractedPageZodSchema),
});

export type ExtractedImage = z.infer<typeof ExtractedImageZodSchema>;
export type ExtractedTable = z.infer<typeof ExtractedTableZodSchema>;
export type ExtractedList = z.infer<typeof ExtractedListZodSchema>;
export type ExtractedLine = z.infer<typeof ExtractedLineZodSchema>;
export type ExtractedPage = z.infer<typeof ExtractedPageZodSchema>;
export type ExtractPdfResult = z.infer<typeof ExtractPdfResultZodSchema>;

const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const SCRIPT_PATH = path.join(process.cwd(), "python", "pdf_extractor", "extract.py");

/**
 * Parses a PDF page-by-page (text, tables, embedded images, naive lists,
 * digital-vs-scanned flag) via a one-shot PyMuPDF subprocess — no persistent
 * Python process, no network hop, bundled in the same deploy as the Node
 * server. `outputDir` receives extracted image files and page renders; the
 * caller owns uploading/cleaning those up.
 */
export async function extractPdf(pdfPath: string, outputDir: string): Promise<ExtractPdfResult> {
    let stdout: string;
    try {
        const result = await execFileAsync(PYTHON_BIN, [SCRIPT_PATH, pdfPath, outputDir], {
            maxBuffer: 50 * 1024 * 1024,
            timeout: 120_000,
        });
        stdout = result.stdout;
    } catch (err: any) {
        const stderr = err?.stderr?.toString?.() || "";
        throw new Error(`PDF extraction failed: ${stderr || err.message}`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(stdout);
    } catch {
        throw new Error(`PDF extraction returned invalid JSON: ${stdout.slice(0, 500)}`);
    }

    return ExtractPdfResultZodSchema.parse(parsed);
}

const BookLineZodSchema = z.object({
    text: z.string(),
    bbox: z.array(z.number()),
    size: z.number(),
    bold: z.boolean(),
    // Mostly monospace: a line of a code listing.
    mono: z.boolean().default(false),
});

const BookImageZodSchema = z.object({
    xref: z.number(),
    bbox: z.array(z.number()),
    path: z.string(),
    width: z.number().nullable(),
    height: z.number().nullable(),
});

const BookTableZodSchema = z.object({
    bbox: z.array(z.number()),
    header: z.array(z.string().nullable()).nullable(),
    rows: z.array(z.array(z.string().nullable())),
});

const BookPageZodSchema = z.object({
    page: z.number(),
    width: z.number(),
    height: z.number(),
    hasTextLayer: z.boolean(),
    lines: z.array(BookLineZodSchema),
    images: z.array(BookImageZodSchema),
    tables: z.array(BookTableZodSchema),
});

const ExtractBookResultZodSchema = z.object({
    pageCount: z.number(),
    // [level, title, page] from the PDF's bookmark outline; empty when the PDF has none.
    toc: z.array(z.tuple([z.number(), z.string(), z.number()])),
    pages: z.array(BookPageZodSchema),
});

export type BookLine = z.infer<typeof BookLineZodSchema>;
export type BookImage = z.infer<typeof BookImageZodSchema>;
export type BookTable = z.infer<typeof BookTableZodSchema>;
export type BookPage = z.infer<typeof BookPageZodSchema>;
export type ExtractBookResult = z.infer<typeof ExtractBookResultZodSchema>;

const BOOK_SCRIPT_PATH = path.join(process.cwd(), "python", "pdf_extractor", "extract_book.py");

/**
 * Extracts a whole book (lines with font size/boldness, images with position,
 * tables, bookmark outline). The result is read from a file the script writes
 * into `outputDir`, since a book's extraction is far larger than stdout should carry.
 */
export async function extractBookPdf(pdfPath: string, outputDir: string): Promise<ExtractBookResult> {
    let stdout: string;
    try {
        const result = await execFileAsync(PYTHON_BIN, [BOOK_SCRIPT_PATH, pdfPath, outputDir], {
            maxBuffer: 1024 * 1024,
            timeout: 20 * 60_000,
        });
        stdout = result.stdout;
    } catch (err: any) {
        const stderr = err?.stderr?.toString?.() || "";
        throw new Error(`Book extraction failed: ${stderr || err.message}`);
    }

    let outPath: string;
    try {
        outPath = JSON.parse(stdout).path;
    } catch {
        throw new Error(`Book extraction returned invalid output: ${stdout.slice(0, 500)}`);
    }

    const { readFile } = await import("node:fs/promises");
    return ExtractBookResultZodSchema.parse(JSON.parse(await readFile(outPath, "utf-8")));
}
