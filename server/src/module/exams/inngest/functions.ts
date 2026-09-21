import { inngest } from "../../../common/inngest/client.js";
import { evaluateAnswer } from "../../evaluation/evaluation.js";
import { getExam, getSubmission, pendingAiAnswers, recalculateScore, recordAnswerMark } from "../exam.service.js";
import { resolveUserOpenAiKey } from "../../users/user.service.js";
import { runWithUserOpenAiKey } from "../../../common/utils/request_context.js";

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

        // Grading spends the exam's OWNER's key, not the candidate's — the
        // candidate has no relationship to the model provider at all.
        const { answers, ownerId } = await step.run("load-pending-answers", async () => {
            const submission = await getSubmission(submissionId);
            if (!submission) throw new Error(`Submission ${submissionId} not found`);
            const exam = await getExam(submission.examId);
            if (!exam) throw new Error(`Exam ${submission.examId} not found`);
            return { answers: await pendingAiAnswers(submissionId), ownerId: exam.createdBy };
        });

        const userOpenAiKey = await resolveUserOpenAiKey(ownerId);

        // The AsyncLocalStorage context from runWithUserOpenAiKey doesn't
        // survive across an Inngest step.run() boundary, so it's
        // re-established fresh inside each grading step's own callback.
        for (const answer of answers) {
            await step.run(`grade-${answer.answerId}`, () =>
                runWithUserOpenAiKey(userOpenAiKey, async () => {
                    const outcome = await evaluateAnswer({
                        question: answer.question,
                        studentAnswer: answer.textAnswer ?? "",
                        maxMarks: answer.marks,
                        contentBlocks: answer.contentBlocks,
                        rubric: answer.rubric,
                    });
                    await recordAnswerMark(answer.answerId, { marksAwarded: outcome.marksAwarded, feedback: outcome.feedback, markedBy: "ai" });
                    return { answerId: answer.answerId, marksAwarded: outcome.marksAwarded };
                })
            );
        }

        await step.run("finalize", async () => {
            const updated = await recalculateScore(submissionId, { status: "submitted", evaluationError: null });
            console.log(`[exams] graded submission ${submissionId}: ${updated.score} mark(s) across ${answers.length} written answer(s)`);
        });
    },
);

export const examFunctions = [gradeSubmissionFunction];
