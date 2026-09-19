/**
 * Heading runs: headings that directly follow each other ("1.2 The SI System" then "1.2.1 Base Units") belong together
 * with the content under the last of them. A subsection starts at the first heading of a run and is named after the last.
 */

/** Heading block numbers at the start of [start, end], in order. */
export function leadingHeadingRun(start: number, end: number, headingLevels: Map<number, number>): number[] {
    const run: number[] = [];
    for (let seq = start; seq <= end && headingLevels.has(seq); seq++) run.push(seq);
    return run;
}

/** True when a heading starts a run, i.e. the block before it isn't a heading. */
export function startsHeadingRun(seq: number, headingLevels: Map<number, number>): boolean {
    return headingLevels.has(seq) && !headingLevels.has(seq - 1);
}

export function isHeadingOnly(start: number, end: number, headingLevels: Map<number, number>): boolean {
    return leadingHeadingRun(start, end, headingLevels).length === end - start + 1;
}

/**
 * Folds every subsection that holds nothing but headings into the subsection right after it, so a heading always
 * stays with its content. A heading-only subsection with nothing after it is kept (for example at a window's end,
 * where the next window's merge picks it up).
 */
export function absorbHeadingOnly<T extends { startBlock: number; endBlock: number }>(subsections: T[], headingLevels: Map<number, number>): T[] {
    const out: T[] = [];
    let pendingStart: number | null = null;
    subsections.forEach((sub, i) => {
        const hasNext = i < subsections.length - 1 && subsections[i + 1]!.startBlock === sub.endBlock + 1;
        if (isHeadingOnly(sub.startBlock, sub.endBlock, headingLevels) && hasNext) {
            pendingStart ??= sub.startBlock;
            return;
        }
        out.push(pendingStart === null ? sub : { ...sub, startBlock: pendingStart });
        pendingStart = null;
    });
    return out;
}
