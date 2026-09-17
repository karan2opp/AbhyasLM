import type { TopicWithSubtopics, AllocatedTopic } from "./Types/outputSubtopics.js";

interface Weightable {
    weight: number;
}

type QuestionAllocation<T> = T & { allocatedQuestions: number };

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Rescales weights to sum to exactly 1. Needed after anything that can drop
 * items from a weighted set (e.g. distributeQuestionsAtLeastOne keeping only
 * the top N when there are more items than questions) — the survivors' old
 * weights were relative to a larger group and no longer sum to 1 on their
 * own.
 */
export function renormalizeWeights<T extends Weightable>(items: T[]): T[] {
    const sum = items.reduce((s, i) => s + i.weight, 0);
    if (sum <= 0) {
        const equal = round3(1 / Math.max(1, items.length));
        return items.map((i) => ({ ...i, weight: equal }));
    }
    return items.map((i) => ({ ...i, weight: round3(i.weight / sum) }));
}

/**
 * Adds a new item to a weighted set that already sums to ~1, giving the new
 * item a fair 1/(n+1) share and proportionally shrinking the existing items
 * to make room — rather than the new item entering at weight 0 and staying
 * there forever (plain renormalizeWeights can't fix that: 0/sum is always 0,
 * no matter what sum is).
 */
export function addItemWithFairShare<T extends Weightable>(existing: T[], newItem: T): T[] {
    const n = existing.length;
    if (n === 0) return [{ ...newItem, weight: 1 }];

    const newShare = 1 / (n + 1);
    const existingSum = existing.reduce((s, i) => s + i.weight, 0) || n;
    const rescaledExisting = existing.map((i) => ({ ...i, weight: round3((i.weight / existingSum) * (1 - newShare)) }));

    return [...rescaledExisting, { ...newItem, weight: round3(newShare) }];
}

/**
 * Largest-remainder distribution: allocates totalQuestions proportional to
 * weight, then hands out whatever's left over one at a time to the items
 * with the largest fractional remainder. Scale-invariant (only weight/total
 * matters), so it works the same whether weights are raw scores or already
 * normalized to sum to 1. Always allocates exactly totalQuestions — no
 * rounding drift.
 */
export function distributeQuestions<T extends Weightable>(
    values: T[],
    totalQuestions: number
): QuestionAllocation<T>[] {
    if (values.length === 0) return [];

    const totalWeight = values.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight <= 0) throw new Error("Total weight must be greater than zero.");

    const allocations = values.map((value, index) => {
        const exact = (value.weight / totalWeight) * totalQuestions;
        return { index, value, allocatedQuestions: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });

    const remaining = totalQuestions - allocations.reduce((sum, a) => sum + a.allocatedQuestions, 0);

    allocations.sort((a, b) => (b.remainder !== a.remainder ? b.remainder - a.remainder : b.value.weight - a.value.weight));
    for (let i = 0; i < remaining; i++) allocations[i]!.allocatedQuestions++;

    allocations.sort((a, b) => a.index - b.index);
    return allocations.map((a) => ({ ...a.value, allocatedQuestions: a.allocatedQuestions }));
}

/**
 * Same idea as distributeQuestions, but guarantees every item gets at least
 * one question when there's room. When there are more items than questions,
 * keeps only the highest-weight items (rather than silently zeroing others
 * out via rounding).
 */
export function distributeQuestionsAtLeastOne<T extends Weightable>(
    values: T[],
    totalQuestions: number
): QuestionAllocation<T>[] {
    if (values.length === 0 || totalQuestions <= 0) return [];

    if (values.length > totalQuestions) {
        return values
            .map((value, index) => ({ value, index }))
            .sort((a, b) => b.value.weight - a.value.weight)
            .slice(0, totalQuestions)
            .map(({ value }) => ({ ...value, allocatedQuestions: 1 }));
    }

    const remainingPool = totalQuestions - values.length;
    const totalWeight = values.reduce((sum, v) => sum + v.weight, 0) || values.length;

    const exact = values.map((v) => (v.weight / totalWeight) * remainingPool);
    const floors = exact.map(Math.floor);
    // Base 1 each, plus each item's floored proportional share of the pool
    // left after giving everyone their guaranteed 1.
    const counts = floors.map((f) => 1 + f);

    let used = counts.reduce((s, c) => s + c, 0);
    const order = exact.map((e, i) => ({ i, r: e - (floors[i] ?? 0) })).sort((a, b) => b.r - a.r);

    let k = 0;
    while (used < totalQuestions) {
        counts[order[k % order.length]!.i]!++;
        used++;
        k++;
    }

    return values.map((value, i) => ({ ...value, allocatedQuestions: counts[i]! }));
}

/**
 * Total questions a finalized blueprint will produce, across every section.
 * Allocation guarantees this equals the sum of the sections' question_count,
 * so it's the number to meter generation against before the pipeline runs.
 */
export function countBlueprintQuestions(sections: { topics: { allocatedQuestions: number }[] }[]): number {
    return sections.reduce(
        (total, section) => total + section.topics.reduce((n, topic) => n + topic.allocatedQuestions, 0),
        0
    );
}

/**
 * Allocates a section's question_count across its topics, then each topic's
 * share across its own subtopics. Both levels use the "at least one" variant:
 * topics because the teacher explicitly typed them into the form (rounding
 * one to zero would silently drop something they asked for), subtopics for
 * the same reason — every subtopic the agent planned should get coverage
 * when there's room for it.
 */
export function allocateSectionQuestions(topics: TopicWithSubtopics[], totalQuestions: number): AllocatedTopic[] {
    const topicsWithAllocations = renormalizeWeights(distributeQuestionsAtLeastOne(topics, totalQuestions));

    return topicsWithAllocations.map((topic) => ({
        ...topic,
        subtopics: renormalizeWeights(distributeQuestionsAtLeastOne(topic.subtopics, topic.allocatedQuestions)),
    }));
}
