import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getClientForModel } from "../../common/agent/openai.client.js";
import { getSetting } from "../settings/settings.service.js";
import type { QuestionContentBlock } from "./Types/outputGeneration.js";

// A second, independent check that runs after the Question Review Agent (or
// the generator it delegates to) proposes an MCQ — separate from the
// structural check in question_review_ops.ts that options exist and are
// shaped correctly. This checks something structure can't: whether the
// option marked correct is ACTUALLY correct, by having a model work out the
// real answer from the question and its content on its own, independent of
// what was claimed.
//
// Rejects rather than fixes: if a question fails, the whole call throws and
// the agent sees why, so it can correct itself in the same turn — this
// never silently saves a wrong answer, and never silently substitutes a
// second model's guess for the first without anyone noticing.

export interface McqToVerify {
    questionText: string;
    contentBlocks: QuestionContentBlock[];
    options: { label: "A" | "B" | "C" | "D"; text: string }[];
    claimedCorrectOption: "A" | "B" | "C" | "D";
}

const VerificationResultZodSchema = z.object({
    results: z.array(
        z.object({
            index: z.number().int(),
            is_correct: z.boolean().describe("true only if the claimed correct option is actually correct — judged independently, not taken on trust"),
            reason: z.string().describe("One or two sentences. If a code block was involved, state the actual computed result explicitly."),
        })
    ),
});

const SYSTEM_PROMPT = `You are a strict, mechanical fact-checker for multiple-choice exam questions. You are not being asked to write or improve anything, and you are not grading a student — you are checking whether the option a question CLAIMS is correct is actually correct.

For each question you are given: question_text (what is being asked), content_blocks (code, a table, or a list the question depends on — null if there is none), options (the four choices, labeled A to D), and claimed_correct_option (which one the question currently says is correct).

Work out the real answer to each question yourself, from question_text and content_blocks alone, before looking at which option is claimed correct. If a content_blocks entry is a code block, mentally execute it precisely, line by line, using its actual semantics — never guess or approximate the result. Once you have your own answer, compare it against the four given options and against claimed_correct_option.

Set is_correct to true only when the claimed option genuinely matches your own independently-worked-out answer. A claimed answer that is close, or correct for the wrong reason, or correct only if you make the same mistake the question-writer might have made, still counts as incorrect — you exist specifically to catch cases where the question-writer got it wrong, so do not extend them the benefit of the doubt. When you mark something incorrect, state in "reason" what the actual answer is and why, concretely — if code was involved, show the real computed result (for example, "arr.slice(2) on [10, 20, 30, 40] evaluates to [30, 40], which is option C — not the claimed option B").

Evaluate every question you are given; do not skip any. Respond with a JSON object only, matching the schema shown, with no other text before or after it.`;

const MAX_ATTEMPTS = 3;

export interface McqVerificationFailure {
    index: number;
    reason: string;
}

/**
 * Verifies a batch of MCQs in one call and returns the ones whose marked answer is wrong (empty when all are
 * correct). Throws only when the checker itself can't produce a usable answer.
 */
export async function findWrongMcqAnswers(items: McqToVerify[]): Promise<McqVerificationFailure[]> {
    if (items.length === 0) return [];

    const model = getSetting("GENERATION_MODEL");
    const client = await getClientForModel(model);
    const payload = items.map((item, index) => ({
        index,
        question_text: item.questionText,
        content_blocks: item.contentBlocks.length > 0 ? item.contentBlocks : null,
        options: item.options,
        claimed_correct_option: item.claimedCorrectOption,
    }));

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
            const response = await client.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: JSON.stringify({ questions: payload }) },
                ],
                response_format: zodResponseFormat(VerificationResultZodSchema, "mcq_verification"),
            });

            const content = response.choices[0]?.message.content || "{}";
            const parsed = VerificationResultZodSchema.parse(JSON.parse(content));

            const checked = new Set(parsed.results.map((r) => r.index));
            if (items.some((_, i) => !checked.has(i))) throw new Error("the checker skipped a question");
            return parsed.results
                .filter((r) => !r.is_correct && r.index >= 0 && r.index < items.length)
                .map((r) => ({ index: r.index, reason: r.reason }));
        } catch (err) {
            // Only a malformed or incomplete response from the checker is retried.
            lastError = err;
            console.warn(`[question-review-verification] attempt ${attempt + 1}/${MAX_ATTEMPTS} produced an invalid response:`, err instanceof Error ? err.message : err);
        }
    }

    throw new Error(`Could not verify MCQ correctness after ${MAX_ATTEMPTS} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

/**
 * Throws with a combined, readable message if any MCQ's marked answer is wrong; resolves silently otherwise.
 * Used where a wrong answer must be rejected so the caller (the review agent) can correct itself.
 */
export async function assertMcqAnswersAreCorrect(items: McqToVerify[]): Promise<void> {
    const failures = await findWrongMcqAnswers(items);
    if (failures.length === 0) return;

    const detail = failures
        .map((f) => {
            const item = items[f.index];
            const preview = item ? `"${item.questionText.slice(0, 70)}${item.questionText.length > 70 ? "..." : ""}"` : `#${f.index}`;
            return `${preview} — claimed option ${item?.claimedCorrectOption} is wrong: ${f.reason}`;
        })
        .join(" | ");

    throw new Error(
        items.length === 1
            ? `This question's marked answer looks wrong: ${detail}`
            : `${failures.length} of ${items.length} question(s) have a wrong marked answer: ${detail}`
    );
}
