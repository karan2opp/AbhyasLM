import { z } from "zod";
import { getClientForModel } from "../../common/agent/openai.client.js";
import { ApiError } from "../../common/utils/ApiError.js";
import { getSetting } from "../settings/settings.service.js";
import { getEvaluationPrompt, runGuardrail } from "./agents/evalAgent.js";
import type { QuestionContentBlock } from "../generation_agents/Types/outputGeneration.js";

const EvaluationOutputSchema = z.object({
    marksAwarded: z.number().optional(),
    feedback: z.unknown().optional(),
    evaluations: z.array(z.object({
        category_scores: z.array(z.object({ name: z.string(), score: z.number() })).optional(),
        feedback: z.string().optional(),
    })).optional(),
});

export type ResponseMode = "marks_only" | "marks_and_feedback";

export interface TextAnswer {
    question: string;
    modelAnswer?: string | undefined;
    studentAnswer: string;
    maxMarks: number;
    questionImages?: { url: string; publicId: string }[] | null | undefined;
    // Code/table/list the question depends on (e.g. "explain what this code
    // does") — without this the grader is judging the student's answer
    // against a question whose actual content it can't see.
    contentBlocks?: QuestionContentBlock[] | undefined;
    rubric?: {
        categories: {
            name: string;
            weight: number;
            key_points: string[];
        }[];
    } | null | undefined;
}

export interface EvaluationOutcome {
    marksAwarded: number;
    feedback: string | null;
}

export const calculateMarksFromScores = (
    categoryScores: { name: string; score: number }[],
    maxMarks: number,
    rubric?: { categories: { name: string; weight: number }[] } | null
): number => {
    let totalWeightedScore = 0;
    
    if (rubric && rubric.categories && rubric.categories.length > 0) {
        for (const catScore of categoryScores) {
            const rubricCat = rubric.categories.find(
                c => c.name.trim().toLowerCase() === catScore.name.trim().toLowerCase()
            );
            if (rubricCat) {
                totalWeightedScore += catScore.score * rubricCat.weight;
            } else {
                totalWeightedScore += catScore.score * (1 / rubric.categories.length);
            }
        }
    } else {
        const defaultWeight = 1 / categoryScores.length;
        for (const catScore of categoryScores) {
            totalWeightedScore += catScore.score * defaultWeight;
        }
    }

    // Rounded to the nearest 0.1 rather than 0.5 — category scores are now a
    // fine-grained 0-1 scale (see evalAgent.ts), so the final mark should be
    // able to actually reflect that (e.g. 2.3, 3.7) instead of being
    // quantized back down onto a coarse half-mark grid regardless of input.
    return Math.min(maxMarks, Math.max(0, Math.round(totalWeightedScore * maxMarks * 10) / 10));
};

// ── Single rubric-based evaluation round ──────────────────────────────────────
// Sends the question, rubric, max marks, and student answer to the model, which
// returns per-category scores; marks are computed deterministically in code.
const evaluateSingleAnswer = async (
    answer: TextAnswer,
    retries = 1
): Promise<EvaluationOutcome> => {
    const modelToUse = getSetting("EVALUATION_MODEL");
    const client = await getClientForModel(modelToUse);

    const inputObj: any = {
        question: answer.question,
        // The question's own code/table/list content, if it has any — the
        // question text may just say "the code below" without repeating it.
        content_blocks: answer.contentBlocks && answer.contentBlocks.length > 0 ? answer.contentBlocks : null,
        max_marks: answer.maxMarks,
        rubric: answer.rubric || null,
        student_answer: answer.studentAnswer,
    };

    const contentParts: any[] = [{ type: "text", text: JSON.stringify(inputObj, null, 2) }];

    if (answer.questionImages && answer.questionImages.length > 0) {
        answer.questionImages.forEach(img => {
            contentParts.push({
                type: "image_url",
                image_url: { url: img.url }
            });
        });
    }

    let attempt = 0;
    while (true) {
        try {
            const systemPrompt = getEvaluationPrompt();

            const response = await client.chat.completions.create({
                model: modelToUse,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: contentParts }
                ],
                response_format: { type: "json_object" }
            });

            const resultStr = response.choices[0]?.message?.content || "{}";
            const result = EvaluationOutputSchema.parse(JSON.parse(resultStr));

            const evalObj = result.evaluations?.[0];
            let marksAwarded = result.marksAwarded;
            let feedback = result.feedback ?? null;
            if (evalObj) {
                if (evalObj.category_scores) {
                    marksAwarded = calculateMarksFromScores(
                        evalObj.category_scores,
                        answer.maxMarks,
                        answer.rubric
                    );
                }
                if (evalObj.feedback) {
                    feedback = evalObj.feedback;
                }
            }

            // Clamp and validate: the model may return junk (NaN, negative, > maxMarks).
            if (typeof marksAwarded !== "number" || !Number.isFinite(marksAwarded)) {
                marksAwarded = 0;
            }
            marksAwarded = Math.min(answer.maxMarks, Math.max(0, marksAwarded));

            let feedbackString: string | null = null;
            if (typeof feedback === "string") {
                feedbackString = feedback;
            } else if (feedback && typeof feedback === "object") {
                const fb = feedback as { strengths?: string; improvements?: string; suggestion?: string };
                feedbackString = `Strengths: ${fb.strengths || ''}\nImprovements: ${fb.improvements || ''}\nSuggestion: ${fb.suggestion || ''}`;
            }

            return { marksAwarded, feedback: feedbackString };
        } catch (error) {
            if (attempt >= retries) {
                console.error("Evaluation error:", error);
                throw new ApiError(500, "Failed to evaluate answer");
            }
            console.log("Retrying evaluation...");
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempt++;
        }
    }
};

// ── Unified evaluation (exams + assignments): guardrail + single rubric-based round ─
// Throws on error so callers can retry.
export const evaluateAnswer = async (answer: TextAnswer): Promise<EvaluationOutcome> => {
    // Safety guardrail
    const guardrailResult = await runGuardrail(answer.studentAnswer);
    if (!guardrailResult.safe) {
        return {
            marksAwarded: 0,
            feedback: `Safety warning: ${guardrailResult.reason || "Potential prompt injection or instructions hijacking detected."}`,
        };
    }

    return evaluateSingleAnswer(answer);
};
