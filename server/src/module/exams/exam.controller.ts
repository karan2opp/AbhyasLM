import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ApiError } from "../../common/utils/ApiError.js";
import { inngest } from "../../common/inngest/client.js";
import {
    deleteExam,
    getCandidatePaper,
    getExamPaper,
    getSubmission,
    getSubmissionResult,
    listExamSubmissions,
    listExamsForExaminer,
    listMySubmissions,
    loadManageableExam,
    markSubmission,
    publishExamFromSession,
    recalculateScore,
    recordAnswerMark,
    saveAnswer,
    startAttempt,
    updateExam,
} from "./exam.service.js";

const requester = (req: Request) => ({ id: req.user!.id, role: req.user!.role });

/** Queues AI grading; a failure there must never lose the candidate's submitted answers. */
async function queueGrading(submissionId: string): Promise<void> {
    try {
        await inngest.send({ name: "exam/submission.grade", data: { submissionId } });
    } catch (err) {
        console.error(`[exams] could not queue grading for submission ${submissionId}:`, (err as Error)?.message);
    }
}

// ── Examiner ────────────────────────────────────────────────────────────────

const PublishZodSchema = z.object({
    sessionId: z.string(),
    durationMinutes: z.number().int().min(1).max(600),
    instructions: z.array(z.string()).default([]),
    // Every exam needs a start and end time so candidates know when they can
    // join and how long the window is — required, not optional.
    opensAt: z.string().datetime(),
    closesAt: z.string().datetime(),
    // "draft" saves it without opening it to candidates — publish for real
    // later via updateExamHandler ({ status: "published" }).
    status: z.enum(["draft", "published"]).default("published"),
});

export const publishExamHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = PublishZodSchema.safeParse(req.body);
        if (!parsed.success) {
            throw ApiError.badRequest(`Invalid request body: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
        }
        const { sessionId, durationMinutes, instructions, opensAt, closesAt, status } = parsed.data;
        const opens = new Date(opensAt);
        const closes = new Date(closesAt);
        if (closes <= opens) throw ApiError.badRequest("The closing time must be after the opening time");

        const exam = await publishExamFromSession({ sessionId, userId: req.user!.id, durationMinutes, instructions, opensAt: opens, closesAt: closes, status });
        console.log(`[exams] ${status === "draft" ? "saved as draft" : "published"} exam ${exam.id} ("${exam.title}")${status === "published" ? ` with code ${exam.joinCode}` : ""}`);
        res.status(201).json({ success: true, data: exam });
    } catch (error) {
        next(error);
    }
};

export const listExamsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        res.json({ success: true, data: await listExamsForExaminer(requester(req)) });
    } catch (error) {
        next(error);
    }
};

export const getExamHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const exam = await loadManageableExam(String(req.params.examId), requester(req));
        res.json({ success: true, data: { exam, sections: await getExamPaper(exam.id) } });
    } catch (error) {
        next(error);
    }
};

const UpdateExamZodSchema = z.object({
    status: z.enum(["draft", "published", "closed"]).optional(),
    resultsVisible: z.boolean().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    instructions: z.array(z.string()).optional(),
    durationMinutes: z.number().int().min(1).max(600).optional(),
    // A schedule can be moved, but not cleared back to "no restriction" —
    // start and end time are mandatory on every exam.
    opensAt: z.string().datetime().optional(),
    closesAt: z.string().datetime().optional(),
});

export const updateExamHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = UpdateExamZodSchema.safeParse(req.body);
        if (!parsed.success) throw ApiError.badRequest("Invalid request body");
        const exam = await loadManageableExam(String(req.params.examId), requester(req));

        const { opensAt, closesAt, ...rest } = parsed.data;
        const nextOpens = opensAt !== undefined ? new Date(opensAt) : exam.opensAt;
        const nextCloses = closesAt !== undefined ? new Date(closesAt) : exam.closesAt;
        if (nextOpens && nextCloses && nextCloses <= nextOpens) throw ApiError.badRequest("The closing time must be after the opening time");

        res.json({
            success: true,
            data: await updateExam(exam.id, {
                ...rest,
                ...(opensAt !== undefined ? { opensAt: new Date(opensAt) } : {}),
                ...(closesAt !== undefined ? { closesAt: new Date(closesAt) } : {}),
            }),
        });
    } catch (error) {
        next(error);
    }
};

export const deleteExamHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const exam = await loadManageableExam(String(req.params.examId), requester(req));
        await deleteExam(exam.id);
        res.json({ success: true, data: { examId: exam.id } });
    } catch (error) {
        next(error);
    }
};

export const listExamSubmissionsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const exam = await loadManageableExam(String(req.params.examId), requester(req));
        res.json({ success: true, data: await listExamSubmissions(exam.id) });
    } catch (error) {
        next(error);
    }
};

// ── Candidate ───────────────────────────────────────────────────────────────

const JoinZodSchema = z.object({ joinCode: z.string().min(4).max(12) });

export const joinExamHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = JoinZodSchema.safeParse(req.body);
        if (!parsed.success) throw ApiError.badRequest("Enter the exam code");
        const { submission, exam } = await startAttempt(parsed.data.joinCode, req.user!.id);
        res.status(201).json({ success: true, data: { submissionId: submission.id, examTitle: exam.title } });
    } catch (error) {
        next(error);
    }
};

export const listMySubmissionsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        res.json({ success: true, data: await listMySubmissions(req.user!.id) });
    } catch (error) {
        next(error);
    }
};

/** The candidate's own attempt. Examiners use the result endpoint instead. */
async function loadOwnSubmission(req: Request) {
    const submission = await getSubmission(String(req.params.submissionId));
    if (!submission || submission.userId !== req.user!.id) throw ApiError.notFound("Attempt not found");
    return submission;
}

export const getPaperHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const submission = await loadOwnSubmission(req);
        if (submission.status !== "in_progress") throw ApiError.badRequest("You have already submitted this exam");
        res.json({ success: true, data: await getCandidatePaper(submission) });
    } catch (error) {
        next(error);
    }
};

const SaveAnswerZodSchema = z.object({
    questionId: z.string(),
    optionIds: z.array(z.string()).optional(),
    textAnswer: z.string().nullable().optional(),
});

export const saveAnswerHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = SaveAnswerZodSchema.safeParse(req.body);
        if (!parsed.success) throw ApiError.badRequest("Invalid answer");
        const submission = await loadOwnSubmission(req);
        const saved = await saveAnswer(submission, parsed.data);
        res.json({ success: true, data: { questionId: saved.questionId, savedAt: saved.updatedAt } });
    } catch (error) {
        next(error);
    }
};

export const submitExamHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const submission = await loadOwnSubmission(req);
        // Submitting after the deadline is fine — it's recorded as an auto-submit.
        const result = await markSubmission(submission, { auto: new Date() > submission.deadlineAt });
        if (result.needsAiGrading) await queueGrading(submission.id);

        console.log(`[exams] submission ${submission.id} submitted (${result.needsAiGrading ? "AI grading queued" : "fully auto-marked"})`);
        res.json({ success: true, data: { submissionId: submission.id, status: result.submission.status, score: result.submission.score } });
    } catch (error) {
        next(error);
    }
};

// ── Results (candidate's own, or the examiner's view) ───────────────────────

export const getResultHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const submission = await getSubmission(String(req.params.submissionId));
        if (!submission) throw ApiError.notFound("Attempt not found");

        const isOwner = submission.userId === req.user!.id;
        let isExaminer = false;
        if (!isOwner) {
            // Throws 404 when this examiner can't manage the exam.
            await loadManageableExam(submission.examId, requester(req));
            isExaminer = true;
        }
        if (isOwner && submission.status === "in_progress") throw ApiError.badRequest("This attempt is still in progress");

        const result = await getSubmissionResult(submission);
        // The examiner decides when candidates can see their marks.
        if (isOwner && !result.exam.resultsVisible) {
            res.json({
                success: true,
                data: { ...result, withheld: true, sections: [], submission: { ...result.submission, score: null } },
            });
            return;
        }
        res.json({ success: true, data: { ...result, withheld: false, canGrade: isExaminer } });
    } catch (error) {
        next(error);
    }
};

const GradeZodSchema = z.object({
    marks: z.array(z.object({ answerId: z.string(), marksAwarded: z.number().min(0), feedback: z.string().nullable().optional() })).min(1),
});

/** An examiner's marks always win: AI grading never overwrites them. */
export const gradeSubmissionHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = GradeZodSchema.safeParse(req.body);
        if (!parsed.success) throw ApiError.badRequest("Invalid marks");
        const submission = await getSubmission(String(req.params.submissionId));
        if (!submission) throw ApiError.notFound("Attempt not found");
        await loadManageableExam(submission.examId, requester(req));
        if (submission.status === "in_progress") throw ApiError.badRequest("This attempt hasn't been submitted yet");

        for (const mark of parsed.data.marks) {
            await recordAnswerMark(mark.answerId, { marksAwarded: mark.marksAwarded, feedback: mark.feedback ?? null, markedBy: "examiner" });
        }
        const updated = await recalculateScore(submission.id);
        res.json({ success: true, data: { submissionId: updated.id, score: updated.score } });
    } catch (error) {
        next(error);
    }
};
