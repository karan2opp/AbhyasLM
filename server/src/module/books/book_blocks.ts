import type { BookImage, BookLine, BookPage, BookTable, ExtractBookResult } from "../../common/pdf/pdf_python_bridge.js";
import { isExactHeadingSource, type BookBlockType, type BookHeadingSource } from "./book.schema.js";

export interface BuiltBlock {
    seq: number;
    page: number;
    type: BookBlockType;
    text: string;
    fontSize: number | null;
    bold: boolean;
    headingLevelHint: number | null;
    headingSource: BookHeadingSource | null;
    imagePath: string | null;
    imageWidth: number | null;
    imageHeight: number | null;
}

type Bbox = number[];

type PageItem =
    | { kind: "line"; bbox: Bbox; line: BookLine; col: string }
    | { kind: "image"; bbox: Bbox; image: BookImage; col: string }
    | { kind: "table"; bbox: Bbox; markdown: string; col: string };

// Internal working block: the persisted fields plus layout facts needed while building.
interface WorkBlock extends Omit<BuiltBlock, "seq"> {
    top: number;
    bottom: number;
}

const LIST_MARKER_RE = /^\s*([•●▪◦‣∙·*–-]|\(?[a-z]\)|\(?(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\)|\d{1,2}[.)])\s+(?=\S)/i;
const FIGURE_CAPTION_RE = /^(fig(ure)?\.?|diagram|illustration|plate|image)\s*[\dA-Z]/i;
const CHAPTER_WORD_RE = /^(chapter|unit|part|lesson|module)\s+([\divxlc]+)\b/i;
const CHAPTER_LABEL_ONLY_RE = /^(chapter|unit|part|lesson|module)\s+([\divxlc]+)[:.]?$/i;
const DOTTED_NUMBER_RE = /^(\d+(?:\.\d+)+)\.?\s+\S/;
const PAGE_NUMBER_RE = /^(page\s*)?(\d{1,4}|[ivxlcdm]{1,6})$/i;

const MARGIN_BAND = 0.08;

const normalizeText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const roundHalf = (n: number) => Math.round(n * 2) / 2;
const endsSentence = (s: string) => /[.!?:;"”')\]]$/.test(s.trim());
const startsContinuation = (s: string) => /^[a-z0-9(\[,;:—–-]/.test(s.trim());

function joinText(prev: string, next: string): string {
    if (/[A-Za-z]-$/.test(prev) && /^[a-z]/.test(next)) return prev.slice(0, -1) + next;
    return `${prev} ${next}`;
}

/** Share of pages that look scanned: no text layer but covered by an image. */
export function scannedPageRatio(book: ExtractBookResult): number {
    if (book.pageCount === 0) return 0;
    const scanned = book.pages.filter((p) => {
        if (p.hasTextLayer) return false;
        const pageArea = p.width * p.height;
        return p.images.some((img) => (img.bbox[2]! - img.bbox[0]!) * (img.bbox[3]! - img.bbox[1]!) >= 0.5 * pageArea);
    }).length;
    return scanned / book.pageCount;
}

/**
 * The usual vertical gap between two lines of the same paragraph, per font size. PDF line boxes already
 * include line spacing, so this is often around 0; a paragraph break is a gap clearly larger than it.
 */
function typicalLineGaps(pages: BookPage[]): { bySize: Map<number, number>; overall: number } {
    const votes = new Map<number, Map<number, number>>();
    const overallVotes = new Map<number, number>();
    for (const page of pages) {
        const lines = [...page.lines].sort((a, b) => a.bbox[1]! - b.bbox[1]!);
        for (let i = 1; i < lines.length; i++) {
            const prev = lines[i - 1]!;
            const line = lines[i]!;
            if (Math.abs(prev.bbox[0]! - line.bbox[0]!) > 12 || Math.abs(prev.size - line.size) > 0.5) continue;
            const gap = line.bbox[1]! - prev.bbox[3]!;
            if (gap < -4 || gap > line.size * 1.5) continue;
            const key = roundHalf(gap);
            const size = roundHalf(line.size);
            const v = votes.get(size) ?? new Map<number, number>();
            v.set(key, (v.get(key) ?? 0) + 1);
            votes.set(size, v);
            overallVotes.set(key, (overallVotes.get(key) ?? 0) + 1);
        }
    }
    const mode = (m: Map<number, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const bySize = new Map<number, number>();
    for (const [size, v] of votes) bySize.set(size, mode(v)!);
    return { bySize, overall: mode(overallVotes) ?? 2 };
}

function bodyFontSize(pages: BookPage[]): number {
    const weights = new Map<number, number>();
    for (const page of pages) {
        for (const line of page.lines) {
            const key = roundHalf(line.size);
            weights.set(key, (weights.get(key) ?? 0) + line.text.length);
        }
    }
    let best = 11;
    let bestWeight = -1;
    for (const [size, weight] of weights) {
        if (weight > bestWeight) {
            best = size;
            bestWeight = weight;
        }
    }
    return best;
}

/** Running headers, footers and page numbers: short lines in the top/bottom margin that repeat across pages. */
function findNoiseLines(pages: BookPage[], bodySize: number): Set<BookLine> {
    const noise = new Set<BookLine>();
    const groups = new Map<string, { pages: Set<number>; lines: BookLine[]; maxSize: number }>();

    for (const page of pages) {
        for (const line of page.lines) {
            const inMargin = line.bbox[1]! < page.height * MARGIN_BAND || line.bbox[3]! > page.height * (1 - MARGIN_BAND);
            if (!inMargin) continue;
            if (PAGE_NUMBER_RE.test(line.text.trim())) {
                noise.add(line);
                continue;
            }
            const key = normalizeText(line.text).replace(/\d+/g, "#");
            if (!key) continue;
            const group = groups.get(key) ?? { pages: new Set<number>(), lines: [], maxSize: 0 };
            group.pages.add(page.page);
            group.lines.push(line);
            group.maxSize = Math.max(group.maxSize, line.size);
            groups.set(key, group);
        }
    }

    const quarterOfBook = pages.length * 0.25;
    for (const group of groups.values()) {
        if (group.pages.size < 3) continue;
        // A big repeated line at the top of pages ("Exercises") is more likely a real heading than a running header.
        const looksLikeHeading = group.maxSize > bodySize * 1.25;
        if (looksLikeHeading && group.pages.size < quarterOfBook) continue;
        for (const line of group.lines) noise.add(line);
    }
    return noise;
}

function tableToMarkdown(table: BookTable): string | null {
    const clean = (cell: string | null) => (cell ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
    const rows = table.rows.map((row) => row.map(clean)).filter((row) => row.some((cell) => cell !== ""));
    const width = Math.max(0, ...rows.map((row) => row.length));
    if (rows.length < 2 || width < 2) return null;
    const padded = rows.map((row) => [...row, ...Array(width - row.length).fill("")]);
    const [header, ...body] = padded;
    return [
        `| ${header!.join(" | ")} |`,
        `| ${header!.map(() => "---").join(" | ")} |`,
        ...body.map((row) => `| ${row.join(" | ")} |`),
    ].join("\n");
}

const insideBox = (inner: Bbox, outer: Bbox) => {
    const cx = (inner[0]! + inner[2]!) / 2;
    const cy = (inner[1]! + inner[3]!) / 2;
    return cx >= outer[0]! - 2 && cx <= outer[2]! + 2 && cy >= outer[1]! - 2 && cy <= outer[3]! + 2;
};

const byYThenX = (a: PageItem, b: PageItem) => (Math.abs(a.bbox[1]! - b.bbox[1]!) <= 3 ? a.bbox[0]! - b.bbox[0]! : a.bbox[1]! - b.bbox[1]!);

/** Joins fragments PyMuPDF reports as separate lines but that sit on the same baseline ("5.3" + "Friction"). */
function mergeSameBaseline(items: PageItem[]): PageItem[] {
    const out: PageItem[] = [];
    for (const item of items) {
        const prev = out[out.length - 1];
        if (
            prev && prev.kind === "line" && item.kind === "line" && prev.col === item.col &&
            Math.abs(prev.bbox[1]! - item.bbox[1]!) <= 2 && Math.abs(prev.bbox[3]! - item.bbox[3]!) <= 2 &&
            item.bbox[0]! >= prev.bbox[2]! - 2
        ) {
            const a = prev.line;
            const b = item.line;
            const total = a.text.length + b.text.length;
            const merged: BookLine = {
                text: `${a.text} ${b.text}`,
                bbox: [a.bbox[0]!, Math.min(a.bbox[1]!, b.bbox[1]!), b.bbox[2]!, Math.max(a.bbox[3]!, b.bbox[3]!)],
                size: (a.size * a.text.length + b.size * b.text.length) / total,
                bold: a.bold && b.bold,
                mono: a.mono && b.mono,
            };
            out[out.length - 1] = { kind: "line", bbox: merged.bbox, line: merged, col: prev.col };
            continue;
        }
        out.push(item);
    }
    return out;
}

/** Reading order for one page: top to bottom, and on two-column pages the left column before the right. */
function orderPage(page: BookPage, lines: BookLine[], tables: { bbox: Bbox; markdown: string }[]): PageItem[] {
    const mid = page.width / 2;
    const crosses = (b: Bbox) => b[0]! < mid - 6 && b[2]! > mid + 6;

    const items: PageItem[] = [
        ...lines.map((line): PageItem => ({ kind: "line", bbox: line.bbox, line, col: "S" })),
        ...page.images.map((image): PageItem => ({ kind: "image", bbox: image.bbox, image, col: "S" })),
        ...tables.map((t): PageItem => ({ kind: "table", bbox: t.bbox, markdown: t.markdown, col: "S" })),
    ];

    const leftOnly = lines.filter((l) => l.bbox[2]! <= mid + 6).length;
    const rightOnly = lines.filter((l) => l.bbox[0]! >= mid - 6).length;
    const crossing = lines.filter((l) => crosses(l.bbox)).length;
    const twoColumn = leftOnly >= 5 && rightOnly >= 5 && crossing <= 0.25 * lines.length;

    if (!twoColumn) return mergeSameBaseline(items.sort(byYThenX));

    // Full-width items (titles, wide figures) cut the page into bands; each band reads left column then right.
    const ordered: PageItem[] = [];
    let band: PageItem[] = [];
    const flush = () => {
        ordered.push(...band.filter((i) => i.col === "L").sort(byYThenX), ...band.filter((i) => i.col === "R").sort(byYThenX));
        band = [];
    };
    for (const item of items.sort((a, b) => a.bbox[1]! - b.bbox[1]!)) {
        if (crosses(item.bbox)) {
            flush();
            ordered.push(item);
        } else {
            item.col = (item.bbox[0]! + item.bbox[2]!) / 2 < mid ? "L" : "R";
            band.push(item);
        }
    }
    flush();
    return mergeSameBaseline(ordered);
}

function isHeadingCandidate(line: BookLine, bodySize: number): boolean {
    if (line.mono) return false;
    const text = line.text.trim();
    if (text.length < 2 || text.length > 150) return false;
    if (/^[\d\s.,:;-]+$/.test(text)) return false;
    const larger = line.size >= bodySize * 1.15 && line.size - bodySize >= 1;
    const chapterWord = CHAPTER_WORD_RE.test(text);
    const dottedNumber = DOTTED_NUMBER_RE.test(text);
    if (/[.;,]$/.test(text) && !larger) return false;
    if (larger) return true;
    if (line.bold && (chapterWord || dottedNumber || text.length <= 80)) return true;
    return chapterWord && text.length <= 80;
}

interface ParagraphState {
    page: number;
    col: string;
    text: string;
    size: number;
    bold: boolean;
    leftX: number;
    top: number;
    lastLine: BookLine;
}

interface CodeState {
    page: number;
    top: number;
    size: number;
    lines: { text: string; x0: number; gapBefore: number }[];
    lastLine: BookLine;
}

interface ListState {
    page: number;
    col: string;
    items: string[];
    ordered: boolean;
    markerX: number;
    top: number;
    lastLine: BookLine;
}

/**
 * Turns an extracted book into numbered blocks in reading order: headings, paragraphs,
 * lists, tables and images (with captions). No AI is involved; heading levels are hints.
 */
export function buildBookBlocks(book: ExtractBookResult): BuiltBlock[] {
    const bodySize = bodyFontSize(book.pages);
    const noise = findNoiseLines(book.pages, bodySize);
    const lineGaps = typicalLineGaps(book.pages);
    const paragraphBreakGap = (size: number) => (lineGaps.bySize.get(roundHalf(size)) ?? lineGaps.overall) + Math.max(2, size * 0.25);
    const blocks: WorkBlock[] = [];

    let paragraph: ParagraphState | null = null;
    let list: ListState | null = null;
    let code: CodeState | null = null;

    const baseBlock = (page: number, type: BookBlockType, text: string, top: number, bottom: number): WorkBlock => ({
        page, type, text, top, bottom,
        fontSize: null, bold: false, headingLevelHint: null, headingSource: null,
        imagePath: null, imageWidth: null, imageHeight: null,
    });

    const flushParagraph = () => {
        if (!paragraph) return;
        blocks.push({
            ...baseBlock(paragraph.page, "paragraph", paragraph.text, paragraph.top, paragraph.lastLine.bbox[3]!),
            fontSize: paragraph.size,
            bold: paragraph.bold,
        });
        paragraph = null;
    };

    // A code listing keeps its lines, and indentation is rebuilt from each line's left position.
    const flushCode = () => {
        if (!code) return;
        const state: CodeState = code;
        const left = Math.min(...state.lines.map((l) => l.x0));
        const charWidth = state.size * 0.6;
        const body = state.lines
            .map((l) => {
                // Indentation can be encoded as position, as leading spaces, or both; the line box starts at any spaces.
                const leadingSpaces = l.text.length - l.text.trimStart().length;
                const indent = " ".repeat(Math.max(0, Math.round((l.x0 - left) / charWidth)) + leadingSpaces);
                return `${l.gapBefore > state.size * 1.2 ? "\n" : ""}${indent}${l.text.trimStart()}`;
            })
            .join("\n");
        blocks.push({ ...baseBlock(state.page, "code", "```\n" + body + "\n```", state.top, state.lastLine.bbox[3]!), fontSize: state.size });
        code = null;
    };

    const flushList = () => {
        if (!list) return;
        const markdown = list.items.map((item, i) => (list!.ordered ? `${i + 1}. ${item}` : `- ${item}`)).join("\n");
        blocks.push(baseBlock(list.page, "list", markdown, list.top, list.lastLine.bbox[3]!));
        list = null;
    };

    for (const page of book.pages) {
        const tables = page.tables
            .map((table) => ({ bbox: table.bbox, markdown: tableToMarkdown(table) }))
            .filter((t): t is { bbox: Bbox; markdown: string } => t.markdown !== null);
        const lines = page.lines.filter((line) => !noise.has(line) && !tables.some((t) => insideBox(line.bbox, t.bbox)));

        const columnRight = new Map<string, number>();
        const columnLeft = new Map<string, number>();
        const items = orderPage(page, lines, tables);
        for (const item of items) {
            if (item.kind !== "line") continue;
            columnRight.set(item.col, Math.max(columnRight.get(item.col) ?? 0, item.bbox[2]!));
            columnLeft.set(item.col, Math.min(columnLeft.get(item.col) ?? Infinity, item.bbox[0]!));
        }

        const continuesParagraph = (state: ParagraphState, line: BookLine, col: string): boolean => {
            const prev = state.lastLine;
            if (Math.abs(prev.size - line.size) > 1) return false;
            if (state.page === page.page) {
                if (state.col === col && line.bbox[1]! >= prev.bbox[1]! - 2) {
                    const gap = line.bbox[1]! - prev.bbox[3]!;
                    if (gap > paragraphBreakGap(line.size)) return false;
                    if (endsSentence(prev.text) && line.bbox[0]! > state.leftX + 8) return false;
                    const right = columnRight.get(state.col) ?? prev.bbox[2]!;
                    const width = right - (columnLeft.get(state.col) ?? state.leftX);
                    if (endsSentence(prev.text) && prev.bbox[2]! < right - 0.12 * width) return false;
                    return true;
                }
                // Jumped to the next column.
                return !endsSentence(prev.text) && startsContinuation(line.text);
            }
            return page.page === state.page + 1 && !endsSentence(prev.text) && startsContinuation(line.text);
        };

        for (let i = 0; i < items.length; i++) {
            const item = items[i]!;

            if (item.kind === "table") {
                flushParagraph();
                flushList();
                flushCode();
                blocks.push(baseBlock(page.page, "table", item.markdown, item.bbox[1]!, item.bbox[3]!));
                continue;
            }

            if (item.kind === "image") {
                flushParagraph();
                flushList();
                flushCode();
                let caption = "";
                // Caption below the image: the next line(s) starting with "Figure ...", close underneath.
                const next = items[i + 1];
                if (next?.kind === "line" && FIGURE_CAPTION_RE.test(next.line.text) && next.bbox[1]! - item.bbox[3]! <= 40) {
                    caption = next.line.text;
                    let last = next.line;
                    i++;
                    while (items[i + 1]?.kind === "line") {
                        const follow = (items[i + 1] as { line: BookLine }).line;
                        if (follow.bbox[1]! - last.bbox[3]! > 3 || Math.abs(follow.size - last.size) > 0.6) break;
                        caption = joinText(caption, follow.text);
                        last = follow;
                        i++;
                    }
                } else {
                    // Caption above the image: a short "Figure ..." paragraph just before it.
                    const prevBlock = blocks[blocks.length - 1];
                    if (
                        prevBlock?.type === "paragraph" && prevBlock.page === page.page && prevBlock.text.length < 250 &&
                        FIGURE_CAPTION_RE.test(prevBlock.text) && item.bbox[1]! - prevBlock.bottom <= 40
                    ) {
                        caption = prevBlock.text;
                        blocks.pop();
                    }
                }
                blocks.push({
                    ...baseBlock(page.page, "image", caption, item.bbox[1]!, item.bbox[3]!),
                    imagePath: item.image.path,
                    imageWidth: item.image.width,
                    imageHeight: item.image.height,
                });
                continue;
            }

            const line = item.line;
            const text = line.text.trim();

            if (line.mono) {
                flushParagraph();
                flushList();
                const current: CodeState | null = code;
                if (current && current.page === page.page) {
                    current.lines.push({ text: line.text, x0: line.bbox[0]!, gapBefore: line.bbox[1]! - current.lastLine.bbox[3]! });
                    current.lastLine = line;
                } else if (current) {
                    // A listing that continues on the next page.
                    current.lines.push({ text: line.text, x0: line.bbox[0]!, gapBefore: 0 });
                    current.lastLine = line;
                    current.page = Math.min(current.page, page.page);
                } else {
                    code = { page: page.page, top: line.bbox[1]!, size: line.size, lines: [{ text: line.text, x0: line.bbox[0]!, gapBefore: 0 }], lastLine: line };
                }
                continue;
            }
            flushCode();

            if (isHeadingCandidate(line, bodySize)) {
                flushParagraph();
                flushList();
                const prevBlock = blocks[blocks.length - 1];
                const wrappedHeading =
                    prevBlock?.type === "heading" && prevBlock.page === page.page && prevBlock.bold === line.bold &&
                    Math.abs((prevBlock.fontSize ?? 0) - line.size) <= 0.6 && line.bbox[1]! - prevBlock.bottom <= line.size * 0.9;
                // "Chapter 5" on its own line followed by the chapter's title, often in a different size.
                const labelThenTitle =
                    prevBlock?.type === "heading" && prevBlock.page === page.page &&
                    CHAPTER_LABEL_ONLY_RE.test(prevBlock.text) && line.bbox[1]! - prevBlock.bottom <= 80;
                if (wrappedHeading || labelThenTitle) {
                    prevBlock!.text = `${prevBlock!.text} ${text}`;
                    prevBlock!.bottom = line.bbox[3]!;
                    prevBlock!.fontSize = Math.max(prevBlock!.fontSize ?? 0, line.size);
                    prevBlock!.bold = prevBlock!.bold || line.bold;
                    continue;
                }
                blocks.push({ ...baseBlock(page.page, "heading", text, line.bbox[1]!, line.bbox[3]!), fontSize: line.size, bold: line.bold });
                continue;
            }

            const marker = LIST_MARKER_RE.exec(text);
            if (marker) {
                flushParagraph();
                const itemText = text.slice(marker[0].length).trim();
                const sameList = list && (list.page !== page.page || line.bbox[1]! - list.lastLine.bbox[3]! <= line.size * 1.5);
                if (!list || !sameList) {
                    flushList();
                    list = { page: page.page, col: item.col, items: [], ordered: /\d/.test(marker[1]!), markerX: line.bbox[0]!, top: line.bbox[1]!, lastLine: line };
                }
                list!.items.push(itemText);
                list!.lastLine = line;
                continue;
            }

            if (list) {
                const current: ListState = list;
                const wrapsItem =
                    current.page === page.page && current.col === item.col &&
                    line.bbox[1]! - current.lastLine.bbox[3]! <= paragraphBreakGap(line.size) &&
                    line.bbox[0]! > current.markerX + 3;
                if (wrapsItem) {
                    current.items[current.items.length - 1] = joinText(current.items[current.items.length - 1]!, text);
                    current.lastLine = line;
                    continue;
                }
                flushList();
            }

            if (paragraph && continuesParagraph(paragraph, line, item.col)) {
                const current: ParagraphState = paragraph;
                current.text = joinText(current.text, text);
                current.leftX = Math.min(current.leftX, line.bbox[0]!);
                current.lastLine = line;
                current.page = page.page;
                current.col = item.col;
                continue;
            }

            flushParagraph();
            paragraph = { page: page.page, col: item.col, text, size: line.size, bold: line.bold, leftX: line.bbox[0]!, top: line.bbox[1]!, lastLine: line };
        }
    }
    flushParagraph();
    flushList();
    flushCode();

    if (book.toc.length > 0) {
        applyHeadingHints(blocks, book.toc, bodySize, "bookmark");
    } else {
        const printed = readPrintedContents(book.pages, blocks);
        // The contents page's own rows would otherwise look like headings.
        for (const block of blocks) {
            if (printed.contentsPages.has(block.page) && block.type === "heading") block.type = "paragraph";
        }
        applyHeadingHints(blocks, printed.toc, bodySize, "contents");
    }

    return blocks.map(({ top, bottom, ...block }, index) => ({
        ...block,
        // PDFs space out numbering ("1.1   Title"); collapse it so names read cleanly.
        text: block.type === "heading" ? block.text.replace(/\s+/g, " ").trim() : block.text,
        seq: index + 1,
    }));
}

function titlesMatch(a: string, b: string): boolean {
    const x = normalizeText(a);
    const y = normalizeText(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const shorter = x.length < y.length ? x : y;
    if (shorter.length >= 4 && (x.includes(y) || y.includes(x))) return true;
    const xs = new Set(x.split(" "));
    const ys = new Set(y.split(" "));
    const common = [...xs].filter((t) => ys.has(t)).length;
    return common / new Set([...xs, ...ys]).size >= 0.6;
}

function numberingLevel(text: string): number | null {
    if (CHAPTER_WORD_RE.test(text)) return 1;
    const dotted = DOTTED_NUMBER_RE.exec(text);
    if (dotted) return Math.min(3, dotted[1]!.split(".").length);
    return null;
}

/**
 * Level hints for heading blocks: bookmarks first (exact), then numbering ("Chapter 5", "5.3"), then font size rank.
 * Bookmark levels are treated as fact later; the others are only hints the AI can overrule.
 */
function applyHeadingHints(blocks: WorkBlock[], toc: ExtractBookResult["toc"], bodySize: number, source: "bookmark" | "contents") {
    if (toc.length > 0) {
        const minLevel = Math.min(...toc.map(([level]) => level));
        const topCount = toc.filter(([level]) => level === minLevel).length;
        // A single top-level bookmark is usually the book's own title wrapping everything.
        const wrapsBook = source === "bookmark" && topCount === 1 && toc.some(([level]) => level > minLevel);
        const shift = minLevel - 1 + (wrapsBook ? 1 : 0);

        let searchFrom = 0;
        for (const [rawLevel, title, pageNo] of toc) {
            const level = Math.min(3, rawLevel - shift);
            if (level < 1) continue;
            const onPage = (block: WorkBlock) => Math.abs(block.page - pageNo) <= 1;
            let matchIndex = -1;
            for (let i = searchFrom; i < blocks.length; i++) {
                const block = blocks[i]!;
                if (block.page > pageNo + 1) break;
                if (!onPage(block)) continue;
                if (block.type === "heading" && titlesMatch(block.text, title)) {
                    matchIndex = i;
                    break;
                }
                if (block.type === "paragraph" && block.text.length <= title.length + 15 && titlesMatch(block.text, title)) {
                    block.type = "heading";
                    matchIndex = i;
                    break;
                }
            }
            if (matchIndex === -1) continue;
            const block = blocks[matchIndex]!;
            block.headingLevelHint = level;
            block.headingSource = source;
            searchFrom = matchIndex + 1;
        }
    }

    const headings = blocks.filter((b) => b.type === "heading" && !isExactHeadingSource(b.headingSource));
    const bookmarked = blocks.filter((b) => isExactHeadingSource(b.headingSource));

    // With bookmarks, other headings in the same font size as bookmarked ones get the same level.
    const levelBySize = new Map<number, number>();
    if (bookmarked.length > 0) {
        const votes = new Map<number, Map<number, number>>();
        for (const b of bookmarked) {
            const size = roundHalf(b.fontSize ?? bodySize);
            const v = votes.get(size) ?? new Map<number, number>();
            v.set(b.headingLevelHint!, (v.get(b.headingLevelHint!) ?? 0) + 1);
            votes.set(size, v);
        }
        for (const [size, v] of votes) levelBySize.set(size, [...v.entries()].sort((a, b) => b[1] - a[1])[0]![0]);
    } else {
        const sizeCounts = new Map<number, number>();
        for (const b of headings) {
            const size = roundHalf(b.fontSize ?? bodySize);
            sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + 1);
        }
        // A size used by a single heading (a title page, a one-off banner) says nothing about the book's structure.
        const rankedSizes = [...sizeCounts.entries()]
            .filter(([size, count]) => size > bodySize * 1.05 && (count >= 2 || headings.length < 5))
            .map(([size]) => size)
            .sort((a, b) => b - a);
        rankedSizes.forEach((size, rank) => levelBySize.set(size, Math.min(3, rank + 1)));
    }

    for (const block of headings) {
        const size = roundHalf(block.fontSize ?? bodySize);
        const bodySized = size <= bodySize * 1.05;
        block.headingLevelHint = numberingLevel(block.text) ?? levelBySize.get(size) ?? (bodySized ? 3 : null);
        block.headingSource = "font";
    }
}

const CONTENTS_TITLE_RE = /^(table of )?contents$/i;
const CONTENTS_SEARCH_PAGES = 40;
const ROMAN_RE = /^[ivxlcdm]+$/i;

interface ContentsEntry {
    numbering: string | null;
    title: string;
    printedPage: number;
    x0: number;
}

/** Rows of a page: lines sharing a baseline joined left to right ("2.3", "Variable names", ". . .", "12"). */
function pageRows(page: BookPage): { text: string; x0: number }[] {
    const sorted = [...page.lines].sort((a, b) => a.bbox[3]! - b.bbox[3]! || a.bbox[0]! - b.bbox[0]!);
    const rows: { lines: BookLine[]; bottom: number }[] = [];
    for (const line of sorted) {
        const row = rows[rows.length - 1];
        if (row && Math.abs(row.bottom - line.bbox[3]!) <= 2.5) row.lines.push(line);
        else rows.push({ lines: [line], bottom: line.bbox[3]! });
    }
    return rows.map((row) => {
        const lines = row.lines.sort((a, b) => a.bbox[0]! - b.bbox[0]!);
        return { text: lines.map((l) => l.text.trim()).join(" "), x0: lines[0]!.bbox[0]! };
    });
}

/** "2.3 Variable names and keywords . . . . 12" → numbering "2.3", title, printed page 12. Roman page numbers are skipped. */
function parseContentsRow(text: string, x0: number): ContentsEntry | null {
    const clean = text.replace(/\s+/g, " ").trim();
    const match = /^(.*?)(?:\s*(?:\.\s*){2,}|\s*…+\s*|\s+)(\d{1,4}|[ivxlcdm]{1,6})$/i.exec(clean);
    if (!match) return null;
    const body = match[1]!.replace(/(\s*\.)+\s*$/, "").trim();
    if (!body || body.length > 150 || !/[a-z]/i.test(body) || ROMAN_RE.test(match[2]!)) return null;
    const numbered = /^(?:(?:chapter|unit|part|lesson|module)\s+)?(\d+(?:\.\d+)*)\.?\s+(.+)$/i.exec(body);
    return {
        numbering: numbered ? numbered[1]! : null,
        title: (numbered ? numbered[2]! : body).trim(),
        printedPage: parseInt(match[2]!, 10),
        x0,
    };
}

/**
 * Reads the book's printed contents page (when the PDF has no bookmarks) into the same [level, title, pdfPage] shape
 * as bookmarks. Levels come from the numbering ("2" chapter, "2.3" section, "2.3.1" subsection), or from indentation
 * for unnumbered entries. Printed page numbers are shifted to PDF pages using where a chapter's heading really is.
 */
function readPrintedContents(pages: BookPage[], blocks: WorkBlock[]): { toc: ExtractBookResult["toc"]; contentsPages: Set<number> } {
    const empty = { toc: [] as ExtractBookResult["toc"], contentsPages: new Set<number>() };
    const entries: ContentsEntry[] = [];
    const contentsPages = new Set<number>();

    for (const page of pages.slice(0, CONTENTS_SEARCH_PAGES)) {
        const rows = pageRows(page);
        const parsed = rows.map((r) => parseContentsRow(r.text, r.x0)).filter((e): e is ContentsEntry => e !== null);
        const titled = rows.some((r) => CONTENTS_TITLE_RE.test(r.text.replace(/\s+/g, " ").trim()));
        const continuing = contentsPages.has(page.page - 1) && parsed.length >= 5 && parsed.length >= rows.length * 0.5;
        if ((titled && parsed.length >= 4) || continuing) {
            contentsPages.add(page.page);
            entries.push(...parsed);
        } else if (contentsPages.size > 0) {
            break;
        }
    }
    if (entries.length < 4) return empty;

    // Printed pages only ever go forward; entries that break that are misreads.
    const ordered: ContentsEntry[] = [];
    for (const entry of entries) {
        if (ordered.length === 0 || entry.printedPage >= ordered[ordered.length - 1]!.printedPage) ordered.push(entry);
    }

    const lastContentsPage = Math.max(...contentsPages);
    const indentLevels = [...new Set(ordered.filter((e) => !e.numbering).map((e) => Math.round(e.x0 / 5) * 5))].sort((a, b) => a - b);
    const levelOf = (e: ContentsEntry) =>
        e.numbering ? Math.min(3, e.numbering.split(".").length) : Math.min(3, indentLevels.indexOf(Math.round(e.x0 / 5) * 5) + 1);
    const fullTitle = (e: ContentsEntry) => (e.numbering ? `${e.numbering} ${e.title}` : e.title);

    // Offset between printed and PDF page numbers, voted on by where the first chapters actually appear.
    const votes = new Map<number, number>();
    const anchors = ordered.filter((e) => levelOf(e) === 1).slice(0, 4);
    for (const anchor of anchors.length ? anchors : ordered.slice(0, 4)) {
        const hit = blocks.find(
            (b) =>
                b.page > lastContentsPage &&
                (b.type === "heading" || (b.type === "paragraph" && b.text.length <= fullTitle(anchor).length + 25)) &&
                (titlesMatch(b.text, fullTitle(anchor)) || titlesMatch(b.text, anchor.title))
        );
        if (hit) votes.set(hit.page - anchor.printedPage, (votes.get(hit.page - anchor.printedPage) ?? 0) + 1);
    }
    const offset = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (offset === undefined) return empty;

    const toc: ExtractBookResult["toc"] = ordered
        .map((e): [number, string, number] => [levelOf(e), fullTitle(e), e.printedPage + offset])
        .filter(([level, , pdfPage]) => level >= 1 && pdfPage > lastContentsPage && pdfPage <= pages.length);
    return { toc, contentsPages };
}
