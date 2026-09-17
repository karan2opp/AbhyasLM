import type { ExtractPdfResult, ExtractedTable } from "../../common/pdf/pdf_python_bridge.js";
import type { QuestionBankRawChunk } from "./question_bank_chunker.js";

/**
 * Answer keys printed as a block at the END of a paper, rather than inline
 * under each question.
 *
 * The classifier only ever sees one question's chunk, so it can never find an
 * answer that lives on a separate page — it correctly returns null for every
 * question and the whole key is lost. This is a document-level pass that runs
 * before classification and hands the pipeline a number -> label map to fill
 * those nulls in from.
 *
 * Deliberately mechanical, no model involved: the key is already unambiguous
 * text ("12. B"), and a model could only make it worse by guessing.
 */

// One "12. B" pair occupying an ENTIRE cell or token — anchored on both ends
// on purpose. A loose search would match the "33. A" inside "Q33. A /26
// subnet mask provides...", turning a question's own text into a fake answer.
const ANSWER_PAIR = /^\s*(\d{1,3})\s*[.)\-:]?\s*([A-Ha-h])\s*$/;

// How many valid pairs a table or line needs before it is treated as a key.
// Two could be coincidence; three in a row is a deliberate list.
const MIN_PAIRS = 3;

const pairFrom = (text: string): [string, string] | null => {
    const m = text.match(ANSWER_PAIR);
    if (!m) return null;
    return [String(parseInt(m[1]!, 10)), m[2]!.toUpperCase()];
};

/** A line like "1. B  2. C  3. B  4. B  5. B" — only pairs, nothing else. */
const pairsFromLine = (text: string): [string, string][] => {
    const tokens = text.split(/[\s,;|]+/).filter(Boolean);
    const pairs: [string, string][] = [];

    // Tokens arrive either glued ("12.B") or split across two ("12." + "B"),
    // depending on how the PDF spaced them.
    for (let i = 0; i < tokens.length; i++) {
        const direct = pairFrom(tokens[i]!);
        if (direct) {
            pairs.push(direct);
            continue;
        }
        const joined = pairFrom(`${tokens[i]} ${tokens[i + 1] ?? ""}`);
        if (joined) {
            pairs.push(joined);
            i++;
            continue;
        }
        // Anything that isn't part of a pair disqualifies the whole line —
        // this is an answer key row or it is prose, never a mix.
        return [];
    }

    return pairs;
};

const pairsFromTable = (table: ExtractedTable): [string, string][] => {
    const cells = [...(table.header ?? []), ...table.rows.flat()].filter(
        (c): c is string => typeof c === "string" && c.trim() !== ""
    );

    const pairs: [string, string][] = [];
    for (const cell of cells) {
        const pair = pairFrom(cell) ?? (pairsFromLine(cell).length === 1 ? pairsFromLine(cell)[0]! : null);
        if (!pair) return [];
        pairs.push(pair);
    }
    return pairs;
};

/** Whether this table is an answer key (and so not content of any question). */
export function isAnswerKeyTable(table: ExtractedTable): boolean {
    return pairsFromTable(table).length >= MIN_PAIRS;
}

/** Whether this line is an answer key row (and so not part of a question). */
export function isAnswerKeyLine(text: string): boolean {
    return pairsFromLine(text).length >= MIN_PAIRS;
}

/**
 * Scans a whole extracted document for an end-of-paper answer key.
 * Returns question number -> answer label, empty when the paper has none.
 * Later occurrences win, so a key at the end beats a stray earlier match.
 */
export function parseAnswerKey(extracted: ExtractPdfResult): Map<string, string> {
    const answers = new Map<string, string>();

    for (const page of extracted.pages) {
        for (const table of page.tables) {
            const pairs = pairsFromTable(table);
            if (pairs.length >= MIN_PAIRS) for (const [n, a] of pairs) answers.set(n, a);
        }
        for (const line of page.lines) {
            const pairs = pairsFromLine(line.text);
            if (pairs.length >= MIN_PAIRS) for (const [n, a] of pairs) answers.set(n, a);
        }
    }

    return answers;
}

/**
 * Removes answer-key content from a chunk. The key sits after the last
 * question marker, so the chunker attaches all of it to the final question —
 * which would otherwise carry the entire key as its own table and text.
 */
export function stripAnswerKeyContent(chunk: QuestionBankRawChunk): QuestionBankRawChunk {
    return {
        ...chunk,
        rawText: chunk.rawText
            .split("\n")
            .filter((line) => !isAnswerKeyLine(line))
            .join("\n")
            .trim(),
        tables: chunk.tables.filter((table) => !isAnswerKeyTable(table)),
    };
}
