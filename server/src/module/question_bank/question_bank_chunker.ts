import type { ExtractPdfResult, ExtractedImage, ExtractedTable } from "../../common/pdf/pdf_python_bridge.js";

export interface QuestionBankRawChunk {
    questionNumber: string | null;
    rawText: string;
    pageStart: number;
    pageEnd: number;
    images: ExtractedImage[];
    tables: ExtractedTable[];
}

// Matches a line that OPENS a new question: "Q1.", "Q.No.5", "Que 1)",
// "Question No. 12 -", etc. Deliberately requires a Q/Que/Question prefix —
// that's what tells it apart from a bare numbered MCQ option like "1. Paris",
// which never gets this prefix.
const QUESTION_MARKER_RE = /^\s*q(?:ue(?:stion)?)?\.?\s*(?:no\.?)?\s*[:\-]?\s*(\d{1,3})\s*[.):\-]?\s*/i;

interface PositionedEvent {
    y: number;
    kind: "line" | "image" | "table";
    line?: { text: string };
    image?: ExtractedImage;
    table?: ExtractedTable;
}

interface ChunkDraft {
    questionNumber: string | null;
    textLines: string[];
    pageStart: number;
    pageEnd: number;
    images: ExtractedImage[];
    tables: ExtractedTable[];
}

function finalizeChunk(draft: ChunkDraft): QuestionBankRawChunk | null {
    const rawText = draft.textLines.join("\n").trim();
    if (!rawText) return null;
    return {
        questionNumber: draft.questionNumber,
        rawText,
        pageStart: draft.pageStart,
        pageEnd: draft.pageEnd,
        images: draft.images,
        tables: draft.tables,
    };
}

/**
 * Splits a whole extracted PDF into one chunk per detected question, using
 * PyMuPDF's per-line bounding boxes to walk the document in true reading
 * order (line, image and table events interleaved by vertical position on
 * each page) rather than relying on the flat per-page text blob. This is
 * what lets an image or table be attributed to the SPECIFIC question it sits
 * under, even when multiple questions share a page — not just "this page",
 * which would be ambiguous whenever a page has more than one question.
 *
 * Content before the first detected question marker (titles, instructions)
 * is dropped — there is no question to attach it to.
 */
export function chunkQuestionBankDocument(extracted: ExtractPdfResult): QuestionBankRawChunk[] {
    const chunks: QuestionBankRawChunk[] = [];
    let current: ChunkDraft | null = null;

    for (const page of extracted.pages) {
        const events: PositionedEvent[] = [
            ...page.lines.map((line): PositionedEvent => ({ y: line.bbox[1] ?? 0, kind: "line", line })),
            ...page.images.map((image): PositionedEvent => ({ y: image.bbox?.[1] ?? -1, kind: "image", image })),
            ...page.tables.map((table): PositionedEvent => ({ y: table.bbox[1] ?? -1, kind: "table", table })),
        ];
        events.sort((a, b) => a.y - b.y);

        for (const event of events) {
            if (event.kind === "line") {
                const text = event.line!.text;
                const match = text.match(QUESTION_MARKER_RE);
                if (match) {
                    const finalized = current && finalizeChunk(current);
                    if (finalized) chunks.push(finalized);

                    const remainder = text.slice(match[0].length).trim();
                    current = {
                        questionNumber: match[1] ?? null,
                        textLines: remainder ? [remainder] : [],
                        pageStart: page.page,
                        pageEnd: page.page,
                        images: [],
                        tables: [],
                    };
                } else if (current) {
                    current.textLines.push(text);
                    current.pageEnd = page.page;
                }
            } else if (event.kind === "image") {
                if (current) current.images.push(event.image!);
            } else if (event.kind === "table") {
                if (current) current.tables.push(event.table!);
            }
        }
    }

    const finalized = current && finalizeChunk(current);
    if (finalized) chunks.push(finalized);

    return chunks;
}
