import { inngest } from "../../../common/inngest/client.js";
import { evaluateAnswer } from "../../evaluation/evaluation.js";
import { getSubmission, pendingAiAnswers, recalculateScore, recordAnswerMark } from "../exam.service.js";

/**
 * Grades the written answers of one submitted attempt, one answer per step so
 * a retry doesn't re-grade (or re-bill) the answers already done. MCQs are
 * already marked at submit time; this only fills in the descriptive ones and
 * then totals the score.
 */
export const gradeSubmissionFunction = inngest.createFunction(
    {
        id: "exam-grade-submission",
        retries: 2,
        concurrency: { key: "event.data.submissionId", limit: 1 },
        triggers: [{ event: "exam/submission.grade" }],
        // Runs once every retry is used up, so an attempt never sits in
        // "evaluating" forever — the examiner can still mark it by hand.
        onFailure: async ({ event, error }) => {
            const submissionId = (event.data.event.data as { submissionId?: string }).submissionId;
            if (submissionId) {
                await recalculateScore(submissionId, { status: "submitted", evaluationError: error?.message || "AI grading failed" });
            }
        },
    },
    async ({ event, step }) => {
        const submissionId = event.data.submissionId as string;

        const answers = await step.run("load-pending-answers", async () => {
            const submission = await getSubmission(submissionId);
            if (!submission) throw new Error(`Submission ${submissionId} not found`);
            return pendingAiAnswers(submissionId);
        });

        for (const answer of answers) {
            await step.run(`grade-${answer.answerId}`, async () => {
                const outcome = await evaluateAnswer({
                    question: answer.question,
                    studentAnswer: answer.textAnswer ?? "",
                    maxMarks: answer.marks,
                    contentBlocks: answer.contentBlocks,
                    rubric: answer.rubric,
                });
                await recordAnswerMark(answer.answerId, { marksAwarded: outcome.marksAwarded, feedback: outcome.feedback, markedBy: "ai" });
                return { answerId: answer.answerId, marksAwarded: outcome.marksAwarded };
            });
        }

        await step.run("finalize", async () => {
            const updated = await recalculateScore(submissionId, { status: "submitted", evaluationError: null });
            console.log(`[exams] graded submission ${submissionId}: ${updated.score} mark(s) across ${answers.length} written answer(s)`);
        });
    },
);

export const examFunctions = [gradeSubmissionFunction];
