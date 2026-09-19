import { z } from "zod";
import pLimit from "p-limit";
import { callStructured, repairRanges } from "./book_ai.js";
import type { IndexBlock, WindowResult, WindowSubsection } from "./book_windows.js";
import { absorbHeadingOnly, isHeadingOnly, leadingHeadingRun } from "./book_headings.js";

export interface MergedSubsection extends WindowSubsection {}

export interface TreeSection {
    title: string;
    titleGenerated: boolean;
    subsections: MergedSubsection[];
}

export interface TreeChapter {
    title: string;
    titleGenerated: boolean;
    sections: TreeSection[];
}

const AI_CONCURRENCY = 4;
const BOUNDARY_TEXT_CHARS = 2_500;

function rangeText(blocksBySeq: Map<number, IndexBlock>, start: number, end: number): string {
    const parts: string[] = [];
    for (let seq = start; seq <= end; seq++) {
        const block = blocksBySeq.get(seq);
        if (block) parts.push(block.text);
    }
    return parts.join("\n\n");
}

const TieBreakZodSchema = z.object({ sameTopic: z.boolean() });

async function isSameTopic(left: WindowSubsection, right: WindowSubsection, blocksBySeq: Map<number, IndexBlock>): Promise<boolean> {
    const leftText = rangeText(blocksBySeq, left.startBlock, left.endBlock).slice(-BOUNDARY_TEXT_CHARS);
    const rightText = rangeText(blocksBySeq, right.startBlock, right.endBlock).slice(0, BOUNDARY_TEXT_CHARS);
    const result = await callStructured(
        TieBreakZodSchema,
        "book_boundary_check",
        `Two parts of a book sit next to each other, separated only because the book was processed in 10-page windows. Decide whether the second part continues the same topic as the first ("sameTopic": true) or starts a new topic ("sameTopic": false).`,
        `FIRST PART: "${left.name}"\n${left.description}\n...end of its text:\n${leftText}\n\nSECOND PART: "${right.name}"\n${right.description}\nStart of its text:\n${rightText}`
    );
    return result.sameTopic;
}

const CombinedDescriptionZodSchema = z.object({ description: z.string(), keyConcepts: z.array(z.string()) });

async function combineDescriptions(name: string, parts: { description: string; keyConcepts: string[] }[]) {
    return callStructured(
        CombinedDescriptionZodSchema,
        "book_combine_description",
        `One subsection of a book was described in parts because it crossed a page window. Write a single 2 to 3 sentence description of the whole subsection, concrete about the concepts, laws, formulas, examples, figures and tables it covers, and list its 3 to 8 most important key concepts. Use only what the parts say.`,
        `SUBSECTION: "${name}"\n${parts.map((p, i) => `PART ${i + 1}: ${p.description}\nKey concepts: ${p.keyConcepts.join(", ")}`).join("\n\n")}`
    );
}

/**
 * Joins window results into one ordered list of subsections. Only the last subsection of a window and the
 * first of the next can merge, and never when the second starts at a heading. Both windows agreeing decides it;
 * when they disagree, a small AI call looks at the text on both sides of the edge.
 */
export async function mergeWindowResults(
    results: WindowResult[],
    blocksBySeq: Map<number, IndexBlock>
): Promise<{ subsections: MergedSubsection[]; headingLevels: Map<number, number> }> {
    const ordered = [...results].sort((a, b) => a.index - b.index);
    const headingLevels = new Map<number, number>();
    for (const result of ordered) for (const h of result.headings) headingLevels.set(h.block, h.level);

    const limit = pLimit(AI_CONCURRENCY);
    const decisions = await Promise.all(
        ordered.slice(1).map((right, i) =>
            limit(async () => {
                const leftWindow = ordered[i]!;
                const left = leftWindow.subsections[leftWindow.subsections.length - 1];
                const first = right.subsections[0];
                if (!left || !first || headingLevels.has(first.startBlock) || left.endBlock !== first.startBlock - 1) return false;
                // A window ending on a bare heading is joined to its content by the heading pass below, not here.
                if (isHeadingOnly(left.startBlock, left.endBlock, headingLevels)) return false;
                if (leftWindow.lastContinuesIntoNext && right.firstContinuesFromPrevious) return true;
                if (!leftWindow.lastContinuesIntoNext && !right.firstContinuesFromPrevious) return false;
                return isSameTopic(left, first, blocksBySeq);
            })
        )
    );

    const merged: { sub: MergedSubsection; parts: { description: string; keyConcepts: string[] }[] }[] = [];
    ordered.forEach((result, windowIndex) => {
        result.subsections.forEach((sub, subIndex) => {
            const part = { description: sub.description, keyConcepts: sub.keyConcepts };
            if (subIndex === 0 && windowIndex > 0 && decisions[windowIndex - 1] && merged.length > 0) {
                const target = merged[merged.length - 1]!;
                target.sub.endBlock = sub.endBlock;
                target.parts.push(part);
                return;
            }
            merged.push({ sub: { ...sub }, parts: [part] });
        });
    });

    await Promise.all(
        merged
            .filter((m) => m.parts.length > 1)
            .map((m) =>
                limit(async () => {
                    const combined = await combineDescriptions(m.sub.name, m.parts);
                    m.sub.description = combined.description.trim();
                    m.sub.keyConcepts = [...new Set(combined.keyConcepts.map((k) => k.trim()).filter(Boolean))].slice(0, 10);
                })
            )
    );

    const subsections = absorbHeadingOnly(merged.map((m) => m.sub), headingLevels).map((sub) => {
        const run = leadingHeadingRun(sub.startBlock, sub.endBlock, headingLevels);
        const heading = run.length > 0 ? blocksBySeq.get(run[run.length - 1]!)?.text.trim() : undefined;
        return heading ? { ...sub, name: heading, nameGenerated: false } : sub;
    });
    return { subsections, headingLevels };
}

const GroupingZodSchema = z.object({
    chapters: z.array(
        z.object({
            title: z.string(),
            firstIndex: z.number().int(),
            lastIndex: z.number().int(),
            sections: z.array(z.object({ title: z.string(), firstIndex: z.number().int(), lastIndex: z.number().int() })),
        })
    ),
});

/** For books with no usable headings: the AI groups consecutive subsections into chapters and sections and names them. */
async function groupPlainSubsections(subsections: MergedSubsection[], bookTitle: string, blocksBySeq: Map<number, IndexBlock>): Promise<TreeChapter[]> {
    const last = subsections.length - 1;
    if (subsections.length <= 6) {
        return [{ title: bookTitle, titleGenerated: true, sections: [{ title: bookTitle, titleGenerated: true, subsections }] }];
    }

    const pageOf = (seq: number) => blocksBySeq.get(seq)?.page ?? 0;
    const listing = subsections
        .map((s, i) => `${i}. [pages ${pageOf(s.startBlock)}–${pageOf(s.endBlock)}] ${s.name}: ${s.description}`)
        .join("\n");

    const output = await callStructured(
        GroupingZodSchema,
        "book_grouping",
        `A book has no chapter or section headings. Its content has already been split into numbered subsections, listed in reading order. Group consecutive subsections into chapters, and consecutive subsections inside each chapter into sections, the way a textbook would organise this material. Give every chapter and section a short, specific title. Groups must cover every subsection from 0 to ${last} exactly once, in order, and only ever contain neighbouring subsections. A chapter usually spans several sections; a section usually spans 1 to 6 subsections.`,
        `BOOK: ${bookTitle}\n\n${listing}`
    );

    const chapters = repairRanges(output.chapters.map((c) => ({ ...c, start: c.firstIndex, end: c.lastIndex })), 0, last);
    if (chapters.length === 0) {
        return [{ title: bookTitle, titleGenerated: true, sections: [{ title: bookTitle, titleGenerated: true, subsections }] }];
    }

    return chapters.map((chapter) => {
        let sections = repairRanges(chapter.sections.map((s) => ({ ...s, start: s.firstIndex, end: s.lastIndex })), chapter.start, chapter.end);
        if (sections.length === 0) sections = [{ title: chapter.title, firstIndex: chapter.start, lastIndex: chapter.end, start: chapter.start, end: chapter.end }];
        return {
            title: chapter.title.trim() || "Untitled chapter",
            titleGenerated: true,
            sections: sections.map((section) => ({
                title: section.title.trim() || chapter.title.trim() || "Untitled section",
                titleGenerated: true,
                subsections: subsections.slice(section.start, section.end + 1),
            })),
        };
    });
}

/**
 * Builds the chapter → section → subsection tree. Real headings decide the structure: a level-1 heading opens a
 * chapter, a level-2 heading opens a section, and anything else stays a subsection of the current section.
 * Subsections that come before any section heading go into an implicit section ("Introduction" when the chapter
 * has real sections later, otherwise named after the chapter). Content before the first chapter becomes "Front Matter".
 */
export async function buildTree(
    subsections: MergedSubsection[],
    headingLevels: Map<number, number>,
    blocksBySeq: Map<number, IndexBlock>,
    bookTitle: string
): Promise<TreeChapter[]> {
    const runs = subsections.map((s) => leadingHeadingRun(s.startBlock, s.endBlock, headingLevels));
    const presentLevels = runs.flat().map((seq) => headingLevels.get(seq)!).filter((l) => l <= 2);
    if (presentLevels.length === 0) return groupPlainSubsections(subsections, bookTitle, blocksBySeq);

    // A book whose biggest headings are all "sections" is treated as having those as chapters.
    const shift = Math.min(...presentLevels) - 1;

    const chapters: (TreeChapter & { implicit: TreeSection[] })[] = [];
    subsections.forEach((sub, i) => {
        for (const seq of runs[i]!) {
            const level = headingLevels.get(seq)! - shift;
            const headingText = blocksBySeq.get(seq)?.text.trim() ?? sub.name;
            if (level === 1) chapters.push({ title: headingText, titleGenerated: false, sections: [], implicit: [] });
            if (level === 2) {
                if (chapters.length === 0) chapters.push({ title: "Front Matter", titleGenerated: true, sections: [], implicit: [] });
                chapters[chapters.length - 1]!.sections.push({ title: headingText, titleGenerated: false, subsections: [] });
            }
        }
        if (chapters.length === 0) chapters.push({ title: "Front Matter", titleGenerated: true, sections: [], implicit: [] });
        const chapter = chapters[chapters.length - 1]!;

        if (chapter.sections.length === 0) {
            const implicit: TreeSection = { title: "", titleGenerated: true, subsections: [] };
            chapter.sections.push(implicit);
            chapter.implicit.push(implicit);
        }
        chapter.sections[chapter.sections.length - 1]!.subsections.push(sub);
    });

    // A heading run can open a chapter or section that the next heading immediately replaces (a title page
    // followed by the preface); those end up empty and are dropped.
    return chapters
        .map(({ implicit, ...chapter }) => {
            const sections = chapter.sections.filter((s) => s.subsections.length > 0);
            const hasRealSections = sections.some((s) => !s.titleGenerated);
            for (const section of implicit) section.title = hasRealSections ? "Introduction" : chapter.title;
            return { ...chapter, sections };
        })
        .filter((chapter) => chapter.sections.length > 0);
}

/** A subsection's content as markdown, rebuilt from its blocks. Confirmed headings keep their level; images link to Cloudinary. */
export function subsectionMarkdown(
    start: number,
    end: number,
    blocksBySeq: Map<number, IndexBlock & { imageUrl?: string | null }>,
    headingLevels: Map<number, number>
): string {
    const parts: string[] = [];
    for (let seq = start; seq <= end; seq++) {
        const block = blocksBySeq.get(seq);
        if (!block) continue;
        switch (block.type) {
            case "heading": {
                const level = headingLevels.get(seq);
                parts.push(level ? `${"#".repeat(level)} ${block.text}` : `**${block.text}**`);
                break;
            }
            case "image":
                if (block.imageUrl) parts.push(`![${block.text || "Figure"}](${block.imageUrl})${block.text ? `\n*${block.text}*` : ""}`);
                break;
            default:
                parts.push(block.text);
        }
    }
    return parts.join("\n\n");
}
