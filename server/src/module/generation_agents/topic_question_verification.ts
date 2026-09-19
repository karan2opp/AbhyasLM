import { generateTopicQuestions, type GenerateTopicQuestionsInput } from "./agents/generation_agent.js";
import { findWrongMcqAnswers, type McqToVerify } from "./question_review_verification.js";
import type { GeneratedQuestion } from "./Types/outputGeneration.js";
import type { QuestionContentBlock } from "./Types/outputGeneration.js";

const REPAIR_ROUNDS = 2;
const LETTERS = ["A", "B", "C", "D"] as const;

const ACCURACY_INSTRUCTION =
    "Every answer key must be exactly right. Work out each answer yourself before writing the options, and for code or numerical questions compute the result step by step.";

function toVerifiable(q: Extract<GeneratedQuestion, { type: "mcq" }>): McqToVerify {
    return {
        questionText: q.question_text,
        contentBlocks: q.content_blocks as QuestionContentBlock[],
        options: q.options.map((o, i) => ({ label: LETTERS[i]!, text: o.text })),
        claimedCorrectOption: q.correct_option,
    };
}

/** Indices (into `questions`) of MCQs whose marked answer an independent check says is wrong. */
async function wrongMcqIndices(questions: GeneratedQuestion[]): Promise<Set<number>> {
    const mcqIndices = questions.map((q, i) => (q.type === "mcq" ? i : -1)).filter((i) => i >= 0);
    const mcqs = mcqIndices.map((i) => toVerifiable(questions[i] as Extract<GeneratedQuestion, { type: "mcq" }>));
    const failures = await findWrongMcqAnswers(mcqs);
    return new Set(failures.map((f) => mcqIndices[f.index]!));
}

/**
 * Checks every generated MCQ's answer key independently and regenerates the ones that are wrong, up to
 * REPAIR_ROUNDS times. Questions still wrong after that are dropped rather than saved with a wrong answer.
 */
export async function verifyAndRepairTopicQuestions(
    input: GenerateTopicQuestionsInput,
    questions: GeneratedQuestion[]
): Promise<GeneratedQuestion[]> {
    const working = [...questions];
    let wrong = await wrongMcqIndices(working);

    for (let round = 1; round <= REPAIR_ROUNDS && wrong.size > 0; round++) {
        console.log(`[generation-verify] topic "${input.topic}": ${wrong.size} question(s) with a wrong answer key, regenerating (round ${round})`);

        const knownNames = new Set(input.subtopics.map((s) => s.name));
        const fallbackName = input.subtopics[0]!.name;
        const counts = new Map<string, number>();
        for (const i of wrong) {
            const name = knownNames.has(working[i]!.subtopic) ? working[i]!.subtopic : fallbackName;
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }

        const keep = working.filter((_, i) => !wrong.has(i)).map((q) => q.question_text);
        let replacements: GeneratedQuestion[];
        try {
            const output = await generateTopicQuestions({
                ...input,
                subtopics: [...counts.entries()].map(([name, count]) => ({ name, count })),
                sourceMaterial: input.sourceMaterial?.filter((m) => counts.has(m.subtopic)),
                globalInstructions: [...input.globalInstructions, ACCURACY_INSTRUCTION],
                topicInstructions: [
                    ...input.topicInstructions,
                    ...(keep.length ? [`Do not repeat or closely resemble these existing questions: ${keep.map((t) => `"${t}"`).join("; ")}`] : []),
                ],
            });
            replacements = output.questions;
        } catch (err) {
            console.warn(`[generation-verify] topic "${input.topic}": regeneration failed (${(err as Error).message})`);
            break;
        }

        // Each wrong slot takes a replacement from the same subtopic when one exists, keeping the blueprint's counts.
        const pool = [...replacements];
        for (const i of [...wrong].sort((a, b) => a - b)) {
            const subtopic = knownNames.has(working[i]!.subtopic) ? working[i]!.subtopic : fallbackName;
            const matchIndex = pool.findIndex((q) => q.subtopic === subtopic);
            const replacement = pool.splice(matchIndex >= 0 ? matchIndex : 0, 1)[0];
            if (replacement) working[i] = { ...replacement, topic: working[i]!.topic, subtopic };
        }

        const wrongOrder = [...wrong].sort((a, b) => a - b);
        const recheck = await wrongMcqIndices(wrongOrder.map((i) => working[i]!));
        wrong = new Set([...recheck].map((localIndex) => wrongOrder[localIndex]!));
    }

    if (wrong.size > 0) {
        console.warn(`[generation-verify] topic "${input.topic}": dropping ${wrong.size} question(s) whose answer key could not be verified`);
    }
    return working.filter((_, i) => !wrong.has(i));
}
