import type { ExamBlueprintSection, AllocatedTopic, AllocatedSubtopic } from "./Types/outputSubtopics.js";
import { distributeQuestionsAtLeastOne, distributeQuestions, allocateSectionQuestions, renormalizeWeights, addItemWithFairShare } from "./allocation.js";
import { generateSectionSubtopics } from "./agents/subtopics_agent.js";
import type { QuestionType, Difficulty, EducationLevel } from "./Types/inputExam.js";
import type {
    SetSubtopicCountArgs,
    SetTopicCountArgs,
    AddSubtopicArgs,
    DeleteSubtopicArgs,
    AddTopicArgs,
    DeleteTopicArgs,
    IncreaseTotalQuestionCountArgs,
} from "./Types/outputBlueprintReview.js";

// Context applyAddTopic needs to generate real, well-reasoned subtopics for a
// topic the teacher didn't originally request — same info the subtopics
// agent would have had if this topic had been part of the original exam.
export interface AddTopicGenerationContext {
    question_type: QuestionType;
    marks: number;
    difficulty?: Difficulty | undefined;
    educationLevel?: EducationLevel | undefined;
    globalInstructions: string[];
}

export interface EditResult {
    section: ExamBlueprintSection;
    changeLog: string[];
}

const findTopic = (section: ExamBlueprintSection, topicName: string): AllocatedTopic => {
    const t = section.topics.find((t) => t.topic === topicName);
    if (!t) throw new Error(`Topic "${topicName}" not found in this section.`);
    return t;
};

const findSubtopic = (topic: AllocatedTopic, subtopicName: string): AllocatedSubtopic => {
    const s = topic.subtopics.find((s) => s.name === subtopicName);
    if (!s) throw new Error(`Subtopic "${subtopicName}" not found under topic "${topic.topic}".`);
    return s;
};

// Topic totals are always a derived sum of their own subtopics — never
// tracked independently — so every mutation ends by recomputing this.
function recomputeTopicTotals(section: ExamBlueprintSection): ExamBlueprintSection {
    return {
        ...section,
        topics: section.topics.map((t) => ({
            ...t,
            allocatedQuestions: t.subtopics.reduce((sum, s) => sum + s.allocatedQuestions, 0),
        })),
    };
}


// Flat list of every subtopic in the section, with a back-reference to its
// topic, for whole-section operations (the "auto" fallback).
function flattenSubtopics(section: ExamBlueprintSection) {
    return section.topics.flatMap((topic) =>
        topic.subtopics.map((subtopic) => ({ topic: topic.topic, subtopic: subtopic.name, weight: subtopic.weight }))
    );
}

/**
 * Removes a subtopic, renormalizing its remaining siblings' weights back to
 * summing to 1. If that was the topic's LAST subtopic, the topic itself is
 * removed too (a topic with zero subtopics isn't a valid state) and the
 * section's remaining topic weights are renormalized in turn. Every
 * permanent removal — explicit delete or an auto-fallback zeroing something
 * out — goes through this single function so the cascade can never be
 * missed, and always logs what happened.
 */
function removeSubtopicCascading(
    section: ExamBlueprintSection,
    topicName: string,
    subtopicName: string,
    changeLog: string[],
    reason: string
): ExamBlueprintSection {
    const topic = section.topics.find((t) => t.topic === topicName);
    if (!topic) return section;

    const remainingSubtopics = topic.subtopics.filter((s) => s.name !== subtopicName);
    changeLog.push(`Removed "${subtopicName}" from "${topicName}" — ${reason}.`);

    if (remainingSubtopics.length === 0) {
        changeLog.push(`Topic "${topicName}" had no subtopics left afterward — removed the topic entirely.`);
        return { ...section, topics: renormalizeWeights(section.topics.filter((t) => t.topic !== topicName)) };
    }

    return {
        ...section,
        topics: section.topics.map((t) => (t.topic === topicName ? { ...t, subtopics: renormalizeWeights(remainingSubtopics) } : t)),
    };
}

function adjustSubtopicCount(section: ExamBlueprintSection, topicName: string, subtopicName: string, delta: number): ExamBlueprintSection {
    return {
        ...section,
        topics: section.topics.map((t) =>
            t.topic !== topicName
                ? t
                : {
                    ...t,
                    subtopics: t.subtopics.map((s) => (s.name === subtopicName ? { ...s, allocatedQuestions: s.allocatedQuestions + delta } : s)),
                }
        ),
    };
}

/**
 * Takes `count` questions one at a time from the lowest-weight subtopics
 * across the WHOLE section (excluding the given target), cascading through
 * removeSubtopicCascading whenever a source hits 0.
 */
function takeQuestionsAuto(
    section: ExamBlueprintSection,
    exclude: { topic: string; subtopic: string },
    count: number,
    changeLog: string[]
): ExamBlueprintSection {
    let working = section;
    let remaining = count;

    while (remaining > 0) {
        const candidates = flattenSubtopics(working)
            .filter((c) => !(c.topic === exclude.topic && c.subtopic === exclude.subtopic))
            .sort((a, b) => a.weight - b.weight);

        if (candidates.length === 0) throw new Error("Not enough questions elsewhere in the section to take from.");

        const source = candidates[0]!;
        working = adjustSubtopicCount(working, source.topic, source.subtopic, -1);
        const topic = working.topics.find((t) => t.topic === source.topic)!;
        const subtopic = topic.subtopics.find((s) => s.name === source.subtopic)!;

        if (subtopic.allocatedQuestions <= 0) {
            working = removeSubtopicCascading(working, source.topic, source.subtopic, changeLog, "its questions ran out while redistributing");
        }
        remaining--;
    }

    return working;
}

/** Takes from explicitly named (topic, subtopic) pairs first, round-robin; falls back to auto for any shortfall. */
function takeQuestionsFrom(
    section: ExamBlueprintSection,
    sources: { topic: string; subtopic: string }[],
    exclude: { topic: string; subtopic: string },
    count: number,
    changeLog: string[]
): ExamBlueprintSection {
    let working = section;
    let remaining = count;
    let i = 0;
    const usable = [...sources];

    while (remaining > 0 && usable.length > 0) {
        const src = usable[i % usable.length]!;
        const topic = working.topics.find((t) => t.topic === src.topic);
        const subtopic = topic?.subtopics.find((s) => s.name === src.subtopic);

        if (!subtopic || subtopic.allocatedQuestions <= 0) {
            usable.splice(i % usable.length, 1);
            if (usable.length === 0) break;
            continue;
        }

        working = adjustSubtopicCount(working, src.topic, src.subtopic, -1);
        const updatedSubtopic = working.topics.find((t) => t.topic === src.topic)!.subtopics.find((s) => s.name === src.subtopic)!;
        if (updatedSubtopic.allocatedQuestions <= 0) {
            working = removeSubtopicCascading(working, src.topic, src.subtopic, changeLog, "reached 0 questions");
            usable.splice(i % usable.length, 1);
        } else {
            i++;
        }
        remaining--;
    }

    if (remaining > 0) working = takeQuestionsAuto(working, exclude, remaining, changeLog);
    return working;
}

/** Distributes `count` extra questions across every subtopic in the section (excluding the target), proportional to weight. */
function giveQuestionsAuto(section: ExamBlueprintSection, exclude: { topic: string; subtopic: string }, count: number): ExamBlueprintSection {
    const targets = flattenSubtopics(section).filter((c) => !(c.topic === exclude.topic && c.subtopic === exclude.subtopic));
    if (targets.length === 0 || count <= 0) return section;

    const boosts = distributeQuestions(targets, count);
    let working = section;
    for (const b of boosts) {
        if (b.allocatedQuestions > 0) working = adjustSubtopicCount(working, b.topic, b.subtopic, b.allocatedQuestions);
    }
    return working;
}

export function applySetSubtopicCount(section: ExamBlueprintSection, args: SetSubtopicCountArgs): EditResult {
    const topic = findTopic(section, args.topic);
    const subtopic = findSubtopic(topic, args.subtopic);
    const delta = args.count - subtopic.allocatedQuestions;
    const changeLog: string[] = [];
    let working = section;

    if (delta === 0) {
        changeLog.push(`"${args.subtopic}" is already at ${args.count} question(s) — no change made.`);
        return { section, changeLog };
    }

    if (args.count === 0) {
        const freed = subtopic.allocatedQuestions;
        working = removeSubtopicCascading(working, args.topic, args.subtopic, changeLog, "set to 0 by request");
        working = giveQuestionsAuto(working, { topic: args.topic, subtopic: args.subtopic }, freed);
        return { section: recomputeTopicTotals(working), changeLog };
    }

    if (delta > 0) {
        const exclude = { topic: args.topic, subtopic: args.subtopic };
        working =
            args.take_from && args.take_from !== "auto"
                ? takeQuestionsFrom(working, args.take_from, exclude, delta, changeLog)
                : takeQuestionsAuto(working, exclude, delta, changeLog);
        working = adjustSubtopicCount(working, args.topic, args.subtopic, delta);
        changeLog.push(`Increased "${args.subtopic}" by ${delta} question(s), now ${args.count}.`);
    } else {
        working = adjustSubtopicCount(working, args.topic, args.subtopic, delta);
        working = giveQuestionsAuto(working, { topic: args.topic, subtopic: args.subtopic }, -delta);
        changeLog.push(`Decreased "${args.subtopic}" by ${-delta} question(s), now ${args.count}; redistributed the freed question(s).`);
    }

    return { section: recomputeTopicTotals(working), changeLog };
}

export function applySetTopicCount(section: ExamBlueprintSection, args: SetTopicCountArgs): EditResult {
    const topic = findTopic(section, args.topic);
    const changeLog: string[] = [];

    if (args.count === 0) {
        return applyDeleteTopic(section, { section: args.section, topic: args.topic });
    }

    const delta = args.count - topic.allocatedQuestions;
    if (delta === 0) {
        changeLog.push(`"${args.topic}" is already at ${args.count} question(s) — no change made.`);
        return { section, changeLog };
    }

    let working = section;

    if (delta > 0) {
        const otherSubtopicTargets = flattenSubtopics(working).filter((c) => c.topic !== args.topic);
        if (otherSubtopicTargets.length === 0) throw new Error("No other topics to take questions from.");

        const explicitTopics = args.take_from && args.take_from !== "auto" ? args.take_from.map((t) => t.topic) : null;
        let remaining = delta;

        while (remaining > 0) {
            const pool = flattenSubtopics(working).filter((c) =>
                c.topic !== args.topic && (!explicitTopics || explicitTopics.includes(c.topic))
            );
            const candidates = (pool.length > 0 ? pool : flattenSubtopics(working).filter((c) => c.topic !== args.topic)).sort(
                (a, b) => a.weight - b.weight
            );
            const source = candidates[0];
            if (!source) throw new Error("Not enough questions elsewhere in the section to take from.");

            working = adjustSubtopicCount(working, source.topic, source.subtopic, -1);
            const t = working.topics.find((t) => t.topic === source.topic)!;
            const s = t.subtopics.find((s) => s.name === source.subtopic)!;
            if (s.allocatedQuestions <= 0) {
                working = removeSubtopicCascading(working, source.topic, source.subtopic, changeLog, "its questions ran out while redistributing");
            }
            remaining--;
        }
    }

    working = {
        ...working,
        topics: working.topics.map((t) =>
            t.topic === args.topic ? { ...t, subtopics: renormalizeWeights(distributeQuestionsAtLeastOne(t.subtopics, args.count)) } : t
        ),
    };

    if (delta < 0) {
        const freed = -delta;
        working = giveQuestionsAuto(working, { topic: args.topic, subtopic: "" }, freed);
    }

    changeLog.push(`Set "${args.topic}" to ${args.count} question(s) (was ${topic.allocatedQuestions}).`);
    return { section: recomputeTopicTotals(working), changeLog };
}

export function applyAddSubtopic(section: ExamBlueprintSection, args: AddSubtopicArgs): EditResult {
    const topic = findTopic(section, args.topic);
    if (topic.subtopics.some((s) => s.name === args.name)) {
        throw new Error(`Subtopic "${args.name}" already exists under "${args.topic}".`);
    }

    const newSubtopic: AllocatedSubtopic = { name: args.name, weight: 0, allocatedQuestions: 0 };
    let working: ExamBlueprintSection = {
        ...section,
        topics: section.topics.map((t) =>
            t.topic === args.topic ? { ...t, subtopics: renormalizeWeights(addItemWithFairShare(t.subtopics, newSubtopic)) } : t
        ),
    };

    const changeLog: string[] = [];
    const exclude = { topic: args.topic, subtopic: args.name };
    working =
        args.take_from && args.take_from !== "auto"
            ? takeQuestionsFrom(working, args.take_from, exclude, args.count, changeLog)
            : takeQuestionsAuto(working, exclude, args.count, changeLog);
    working = adjustSubtopicCount(working, args.topic, args.name, args.count);

    changeLog.push(`Added subtopic "${args.name}" under "${args.topic}" with ${args.count} question(s).`);
    return { section: recomputeTopicTotals(working), changeLog };
}

export function applyDeleteSubtopic(section: ExamBlueprintSection, args: DeleteSubtopicArgs): EditResult {
    const topic = findTopic(section, args.topic);
    const subtopic = findSubtopic(topic, args.subtopic);

    if (topic.subtopics.length === 1) {
        return applyDeleteTopic(section, { section: args.section, topic: args.topic });
    }

    const changeLog: string[] = [];
    let working = removeSubtopicCascading(section, args.topic, args.subtopic, changeLog, "deleted by request");
    working = giveQuestionsAuto(working, { topic: args.topic, subtopic: args.subtopic }, subtopic.allocatedQuestions);

    return { section: recomputeTopicTotals(working), changeLog };
}

export async function applyAddTopic(
    section: ExamBlueprintSection,
    args: AddTopicArgs,
    generationContext: AddTopicGenerationContext
): Promise<EditResult> {
    if (section.topics.some((t) => t.topic === args.name)) {
        throw new Error(`Topic "${args.name}" already exists in this section.`);
    }

    // If the teacher didn't explicitly name subtopics, delegate to the real
    // subtopics agent — same THOUGHT ORDER reasoning (education level,
    // difficulty, instructions) used for every other topic in this exam,
    // rather than the review agent inventing names on its own judgment.
    let subtopicNames: { name: string; weight: number }[];
    if (args.subtopics && args.subtopics.length > 0) {
        subtopicNames = args.subtopics.map((name) => ({ name, weight: 0 }));
    } else {
        const generated = await generateSectionSubtopics(
            {
                name: section.name,
                subject: section.subject,
                question_count: args.count,
                question_type: generationContext.question_type,
                marks: generationContext.marks,
                topics: [args.name],
            },
            {
                globalInstructions: generationContext.globalInstructions,
                topicInstructions: [],
                difficulty: generationContext.difficulty,
                educationLevel: generationContext.educationLevel,
            }
        );
        const generatedTopic = generated.topics[0];
        subtopicNames = generatedTopic ? generatedTopic.subtopics : [{ name: args.name, weight: 0 }];
    }

    const subtopics: AllocatedSubtopic[] = renormalizeWeights(
        subtopicNames.map((s) => ({ name: s.name, weight: s.weight, allocatedQuestions: 0 }))
    );
    const newTopic: AllocatedTopic = { topic: args.name, weight: 0, allocatedQuestions: 0, subtopics };

    let working: ExamBlueprintSection = {
        ...section,
        topics: renormalizeWeights(addItemWithFairShare(section.topics, newTopic)),
    };

    const changeLog: string[] = [];
    const otherSubtopics = flattenSubtopics(section);
    if (otherSubtopics.length === 0) {
        throw new Error("No existing questions in this section to fund the new topic from.");
    }

    let remaining = args.count;
    const explicitTopics = args.take_from && args.take_from !== "auto" ? args.take_from.map((t) => t.topic) : null;

    while (remaining > 0) {
        const pool = flattenSubtopics(working).filter((c) => c.topic !== args.name && (!explicitTopics || explicitTopics.includes(c.topic)));
        const candidates = (pool.length > 0 ? pool : flattenSubtopics(working).filter((c) => c.topic !== args.name)).sort(
            (a, b) => a.weight - b.weight
        );
        const source = candidates[0];
        if (!source) throw new Error("Not enough questions elsewhere in the section to fund the new topic.");

        working = adjustSubtopicCount(working, source.topic, source.subtopic, -1);
        const t = working.topics.find((t) => t.topic === source.topic)!;
        const s = t.subtopics.find((s) => s.name === source.subtopic)!;
        if (s.allocatedQuestions <= 0) {
            working = removeSubtopicCascading(working, source.topic, source.subtopic, changeLog, "its questions ran out while funding the new topic");
        }
        remaining--;
    }

    working = {
        ...working,
        topics: working.topics.map((t) =>
            t.topic === args.name ? { ...t, subtopics: renormalizeWeights(distributeQuestionsAtLeastOne(t.subtopics, args.count)) } : t
        ),
    };

    changeLog.push(`Added topic "${args.name}" with ${args.count} question(s) across ${subtopicNames.length} subtopic(s).`);
    return { section: recomputeTopicTotals(working), changeLog };
}

export function applyDeleteTopic(section: ExamBlueprintSection, args: DeleteTopicArgs): EditResult {
    const topic = findTopic(section, args.topic);
    if (section.topics.length === 1) {
        throw new Error("Cannot delete the only topic in a section.");
    }

    let working: ExamBlueprintSection = {
        ...section,
        topics: renormalizeWeights(section.topics.filter((t) => t.topic !== args.topic)),
    };
    working = giveQuestionsAuto(working, { topic: args.topic, subtopic: "" }, topic.allocatedQuestions);

    const changeLog = [`Deleted topic "${args.topic}" and redistributed its ${topic.allocatedQuestions} question(s) across the remaining topics.`];
    return { section: recomputeTopicTotals(working), changeLog };
}

export function applyIncreaseTotalQuestionCount(section: ExamBlueprintSection, args: IncreaseTotalQuestionCountArgs): EditResult {
    const currentTotal = section.topics.reduce((sum, t) => sum + t.allocatedQuestions, 0);
    const allocated = allocateSectionQuestions(section.topics, args.new_total);

    const changeLog = [
        `Changed the section total from ${currentTotal} to ${args.new_total} question(s), reallocated proportionally to each topic's existing weight.`,
    ];
    return { section: { ...section, topics: allocated }, changeLog };
}
