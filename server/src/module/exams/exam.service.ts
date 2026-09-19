import { and, desc, eq, inArray, sql } from "drizzle-orm";
import db from "../../common/db/index.js";
import { ApiError } from "../../common/utils/ApiError.js";
import { getSession } from "../generation_agents/exam_intent_session.service.js";
import { users } from "../users/user.schema.js";
import {
    answers,
    examOptions,
    examQuestions,
    examSections,
    exams,
    submissions,
    type Exam,
    type QuestionRubric,
    type Submission,
} from "./exam.schema.js";

const LETTERS = ["A", "B", "C", "D"] as const;
// No I, O, 0 or 1 — a join code gets read aloud and typed by hand.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateJoinCode(length = 6): string {
    let code = "";
    for (let i = 0; i < length; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return code;
}

/** Examiners see their own exams; admins see everyone's. */
const canManage = (exam: Exam, user: { id: string; role: string | null }) => exam.createdBy === user.id || user.role === "admin";

export async function getExam(examId: string): Promise<Exam | null> {
    const [exam] = await db.select().from(exams).where(eq(exams.id, examId));
    return exam ?? null;
}

export async function loadManageableExam(examId: string, user: { id: string; role: string | null }): Promise<Exam> {
    const exam = await getExam(examId);
    // 404, not 403, so an exam the caller can't reach isn't confirmed to exist.
    if (!exam || !canManage(exam, user)) throw ApiError.notFound("Exam not found");
    return exam;
}

/**
 * Freezes a finished generation session into an exam: one exam_section per
 * generated section, questions numbered straight through each section's topics
 * (the same numbering the review agent and the UI use), and MCQ options stored
 * with their correct flag.
 */
export async function publishExamFromSession(input: {
    sessionId: string;
    userId: string;
    durationMinutes: number;
    instructions: string[];
    // Every exam has a start and end time so candidates know when they can
    // join and how long the window is — required, not optional.
    opensAt: Date;
    closesAt: Date;
    // "draft" saves it without letting anyone join yet — an examiner can
    // publish it for real later from the Published exams page.
    status: "draft" | "published";
}): Promise<Exam> {
    const session = await getSession(input.sessionId);
    if (!session) throw ApiError.notFound("Session not found");
    if (session.createdBy !== input.userId) throw ApiError.forbidden("Not your session");
    if (session.questionsStatus !== "completed" || !session.questions) throw ApiError.badRequest("This exam's questions aren't ready yet");

    const generated = session.questions;
    const totalMarks = generated.sections.reduce(
        (sum, section) => sum + section.topics.reduce((s, topic) => s + topic.questions.reduce((m, q) => m + q.marks, 0), 0),
        0,
    );
    if (totalMarks <= 0) throw ApiError.badRequest("This exam has no questions to publish");

    return db.transaction(async (tx) => {
        // Retry on the tiny chance of a duplicate code.
        let exam: Exam | undefined;
        for (let attempt = 0; attempt < 5 && !exam; attempt++) {
            const [row] = await tx
                .insert(exams)
                .values({
                    createdBy: input.userId,
                    sessionId: session.id,
                    title: session.examInput.title || "Untitled Exam",
                    instructions: input.instructions,
                    durationMinutes: input.durationMinutes,
                    joinCode: generateJoinCode(),
                    totalMarks,
                    opensAt: input.opensAt,
                    closesAt: input.closesAt,
                    status: input.status,
                })
                .onConflictDoNothing()
                .returning();
            exam = row;
        }
        if (!exam) throw ApiError.internal("Could not allocate a join code — please try again");

        for (const [sectionIndex, section] of generated.sections.entries()) {
            const [sectionRow] = await tx
                .insert(examSections)
                .values({ examId: exam.id, title: section.name, subject: section.subject, position: sectionIndex })
                .returning();

            let position = 0;
            for (const topic of section.topics) {
                for (const question of topic.questions) {
                    const [questionRow] = await tx
                        .insert(examQuestions)
                        .values({
                            examId: exam.id,
                            sectionId: sectionRow!.id,
                            type: question.type,
                            description: question.question_text,
                            contentBlocks: question.content_blocks,
                            topic: topic.topic,
                            subtopic: question.subtopic,
                            marks: question.marks,
                            rubric: question.type === "descriptive" ? (question.rubric as QuestionRubric) : null,
                            position: position++,
                        })
                        .returning();

                    if (question.type === "mcq") {
                        await tx.insert(examOptions).values(
                            question.options.map((option, i) => ({
                                questionId: questionRow!.id,
                                value: option.text,
                                isCode: option.isCode,
                                isCorrect: LETTERS[i] === question.correct_option,
                                position: i,
                            })),
                        );
                    }
                }
            }
        }

        return exam;
    });
}

export async function listExamsForExaminer(user: { id: string; role: string | null }) {
    const rows = await db
        .select({
            id: exams.id,
            title: exams.title,
            joinCode: exams.joinCode,
            status: exams.status,
            durationMinutes: exams.durationMinutes,
            totalMarks: exams.totalMarks,
            opensAt: exams.opensAt,
            closesAt: exams.closesAt,
            resultsVisible: exams.resultsVisible,
            createdBy: exams.createdBy,
            createdAt: exams.createdAt,
            questionCount: sql<number>`(select count(*)::int from ${examQuestions} where ${examQuestions.examId} = ${exams.id})`,
            submissionCount: sql<number>`(select count(*)::int from ${submissions} where ${submissions.examId} = ${exams.id})`,
        })
        .from(exams)
        .orderBy(desc(exams.createdAt));

    // Admins see every exam; examiners only their own.
    return user.role === "admin" ? rows : rows.filter((row) => row.createdBy === user.id);
}

/** The full paper, answer keys included — for the examiner who owns it. */
export async function getExamPaper(examId: string) {
    const [sections, questions] = await Promise.all([
        db.select().from(examSections).where(eq(examSections.examId, examId)).orderBy(examSections.position),
        db.select().from(examQuestions).where(eq(examQuestions.examId, examId)).orderBy(examQuestions.position),
    ]);
    const questionIds = questions.map((q) => q.id);
    const optionRows = questionIds.length
        ? await db.select().from(examOptions).where(inArray(examOptions.questionId, questionIds)).orderBy(examOptions.position)
        : [];

    return sections.map((section) => ({
        id: section.id,
        title: section.title,
        subject: section.subject,
        questions: questions
            .filter((q) => q.sectionId === section.id)
            .map((q) => ({ ...q, options: optionRows.filter((o) => o.questionId === q.id) })),
    }));
}

export async function updateExam(
    examId: string,
    patch: {
        status?: Exam["status"] | undefined;
        resultsVisible?: boolean | undefined;
        title?: string | undefined;
        instructions?: string[] | undefined;
        durationMinutes?: number | undefined;
        opensAt?: Date | undefined;
        closesAt?: Date | undefined;
    },
) {
    const [updated] = await db
        .update(exams)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(exams.id, examId))
        .returning();
    return updated!;
}

export async function deleteExam(examId: string) {
    await db.delete(exams).where(eq(exams.id, examId));
}

// ── Taking an exam ──────────────────────────────────────────────────────────

/** Starts the attempt, or returns the one already in progress. */
export async function startAttempt(joinCode: string, userId: string): Promise<{ submission: Submission; exam: Exam }> {
    const [exam] = await db.select().from(exams).where(eq(exams.joinCode, joinCode.trim().toUpperCase()));
    if (!exam) throw ApiError.notFound("No exam found for that code");

    const [existing] = await db.select().from(submissions).where(and(eq(submissions.examId, exam.id), eq(submissions.userId, userId)));
    if (existing) {
        if (existing.status !== "in_progress") throw ApiError.conflict("You have already taken this exam");
        return { submission: existing, exam };
    }

    const now = new Date();
    if (exam.status !== "published") throw ApiError.badRequest("This exam isn't open");
    if (exam.opensAt && now < exam.opensAt) throw ApiError.badRequest("This exam hasn't started yet");
    if (exam.closesAt && now > exam.closesAt) throw ApiError.badRequest("This exam has closed");

    // The attempt ends after the duration, or when the exam closes — whichever comes first.
    const durationEnd = new Date(now.getTime() + exam.durationMinutes * 60_000);
    const deadlineAt = exam.closesAt && exam.closesAt < durationEnd ? exam.closesAt : durationEnd;

    const [created] = await db
        .insert(submissions)
        .values({ examId: exam.id, userId, startedAt: now, deadlineAt })
        .onConflictDoNothing()
        .returning();
    if (created) return { submission: created, exam };

    // Someone started the same attempt in a parallel request.
    const [raced] = await db.select().from(submissions).where(and(eq(submissions.examId, exam.id), eq(submissions.userId, userId)));
    if (!raced) throw ApiError.internal("Could not start the exam");
    return { submission: raced, exam };
}

export async function getSubmission(submissionId: string): Promise<Submission | null> {
    const [submission] = await db.select().from(submissions).where(eq(submissions.id, submissionId));
    return submission ?? null;
}

/** The paper as a candidate sees it: no correct flags, plus their saved answers. */
export async function getCandidatePaper(submission: Submission) {
    const [exam] = await db.select().from(exams).where(eq(exams.id, submission.examId));
    const sections = await getExamPaper(submission.examId);
    const saved = await db.select().from(answers).where(eq(answers.submissionId, submission.id));

    return {
        exam: {
            id: exam!.id,
            title: exam!.title,
            instructions: exam!.instructions ?? [],
            durationMinutes: exam!.durationMinutes,
            totalMarks: exam!.totalMarks,
        },
        submission: {
            id: submission.id,
            status: submission.status,
            startedAt: submission.startedAt,
            deadlineAt: submission.deadlineAt,
        },
        sections: sections.map((section) => ({
            id: section.id,
            title: section.title,
            subject: section.subject,
            questions: section.questions.map((q) => ({
                id: q.id,
                type: q.type,
                description: q.description,
                contentBlocks: q.contentBlocks,
                marks: q.marks,
                position: q.position,
                // isCorrect is deliberately left out here.
                options: q.options.map((o) => ({ id: o.id, value: o.value, isCode: o.isCode })),
            })),
        })),
        answers: saved.map((a) => ({ questionId: a.questionId, optionIds: a.optionIds ?? [], textAnswer: a.textAnswer })),
    };
}

export async function saveAnswer(submission: Submission, input: { questionId: string; optionIds?: string[] | undefined; textAnswer?: string | null | undefined }) {
    if (submission.status !== "in_progress") throw ApiError.forbidden("This attempt has already been submitted");
    if (new Date() > submission.deadlineAt) throw ApiError.forbidden("Your time is up");

    const [question] = await db.select().from(examQuestions).where(eq(examQuestions.id, input.questionId));
    if (!question || question.examId !== submission.examId) throw ApiError.notFound("Question not found in this exam");

    if (input.optionIds?.length) {
        const chosen = await db.select().from(examOptions).where(inArray(examOptions.id, input.optionIds));
        if (chosen.length !== input.optionIds.length || chosen.some((o) => o.questionId !== question.id)) {
            throw ApiError.badRequest("Those options don't belong to this question");
        }
    }

    // Marks are worked out at submit time, never from what the client sends.
    const [saved] = await db
        .insert(answers)
        .values({
            submissionId: submission.id,
            questionId: question.id,
            optionIds: input.optionIds ?? [],
            textAnswer: input.textAnswer ?? null,
        })
        .onConflictDoUpdate({
            target: [answers.submissionId, answers.questionId],
            set: { optionIds: input.optionIds ?? [], textAnswer: input.textAnswer ?? null, updatedAt: new Date() },
        })
        .returning();
    return saved!;
}

/**
 * Marks every MCQ from the stored answer keys, then reports whether any
 * written answers still need the AI grader. The caller queues that separately,
 * so a slow grader never blocks the candidate's submit.
 */
export async function markSubmission(submission: Submission, options: { auto: boolean }): Promise<{ submission: Submission; needsAiGrading: boolean }> {
    if (submission.status !== "in_progress") throw ApiError.badRequest("This attempt has already been submitted");

    const questions = await db.select().from(examQuestions).where(eq(examQuestions.examId, submission.examId));
    const given = await db.select().from(answers).where(eq(answers.submissionId, submission.id));
    const answerByQuestion = new Map(given.map((a) => [a.questionId, a]));

    const mcqIds = questions.filter((q) => q.type === "mcq").map((q) => q.id);
    const correctByQuestion = new Map<string, string[]>();
    if (mcqIds.length > 0) {
        const correctRows = await db.select().from(examOptions).where(and(inArray(examOptions.questionId, mcqIds), eq(examOptions.isCorrect, true)));
        for (const row of correctRows) correctByQuestion.set(row.questionId, [...(correctByQuestion.get(row.questionId) ?? []), row.id]);
    }

    let score = 0;
    let needsAiGrading = false;

    for (const question of questions) {
        const answer = answerByQuestion.get(question.id);

        if (question.type === "mcq") {
            const correct = (correctByQuestion.get(question.id) ?? []).sort();
            const chosen = [...(answer?.optionIds ?? [])].sort();
            const isCorrect = correct.length > 0 && correct.length === chosen.length && correct.every((id, i) => id === chosen[i]);
            const marksAwarded = isCorrect ? question.marks : 0;
            score += marksAwarded;

            await db
                .insert(answers)
                .values({ submissionId: submission.id, questionId: question.id, optionIds: answer?.optionIds ?? [], isCorrect, marksAwarded, markedBy: "auto" })
                .onConflictDoUpdate({
                    target: [answers.submissionId, answers.questionId],
                    set: { isCorrect, marksAwarded, markedBy: "auto", updatedAt: new Date() },
                });
        } else if (answer?.textAnswer?.trim()) {
            needsAiGrading = true;
        } else {
            // Nothing written: no marks, and nothing for the grader to read.
            await db
                .insert(answers)
                .values({ submissionId: submission.id, questionId: question.id, marksAwarded: 0, feedback: "No answer given.", markedBy: "auto" })
                .onConflictDoUpdate({
                    target: [answers.submissionId, answers.questionId],
                    set: { marksAwarded: 0, feedback: "No answer given.", markedBy: "auto", updatedAt: new Date() },
                });
        }
    }

    const [updated] = await db
        .update(submissions)
        .set({
            status: needsAiGrading ? "evaluating" : "submitted",
            score,
            submittedAt: new Date(),
            autoSubmitted: options.auto,
            updatedAt: new Date(),
        })
        .where(eq(submissions.id, submission.id))
        .returning();

    return { submission: updated!, needsAiGrading };
}

/** Adds up every marked answer — used after AI grading and after an examiner's overrides. */
export async function recalculateScore(submissionId: string, patch: { status?: Submission["status"]; evaluationError?: string | null } = {}) {
    const rows = await db.select().from(answers).where(eq(answers.submissionId, submissionId));
    const score = rows.reduce((sum, a) => sum + (a.marksAwarded ?? 0), 0);
    const [updated] = await db
        .update(submissions)
        .set({ score, ...patch, updatedAt: new Date() })
        .where(eq(submissions.id, submissionId))
        .returning();
    return updated!;
}

/** Written answers still waiting on the AI grader, with everything it needs. */
export async function pendingAiAnswers(submissionId: string) {
    const rows = await db
        .select({
            answerId: answers.id,
            questionId: examQuestions.id,
            question: examQuestions.description,
            contentBlocks: examQuestions.contentBlocks,
            marks: examQuestions.marks,
            rubric: examQuestions.rubric,
            textAnswer: answers.textAnswer,
            markedBy: answers.markedBy,
        })
        .from(answers)
        .innerJoin(examQuestions, eq(answers.questionId, examQuestions.id))
        .where(and(eq(answers.submissionId, submissionId), eq(examQuestions.type, "descriptive")));

    // An examiner's mark is never overwritten by AI grading.
    return rows.filter((row) => row.markedBy !== "examiner" && !!row.textAnswer?.trim());
}

export async function recordAnswerMark(answerId: string, mark: { marksAwarded: number; feedback: string | null; markedBy: "ai" | "examiner" }) {
    await db.update(answers).set({ ...mark, updatedAt: new Date() }).where(eq(answers.id, answerId));
}

// ── Results ─────────────────────────────────────────────────────────────────

export async function listMySubmissions(userId: string) {
    return db
        .select({
            id: submissions.id,
            examId: exams.id,
            title: exams.title,
            status: submissions.status,
            score: submissions.score,
            totalMarks: exams.totalMarks,
            resultsVisible: exams.resultsVisible,
            deadlineAt: submissions.deadlineAt,
            submittedAt: submissions.submittedAt,
            startedAt: submissions.startedAt,
        })
        .from(submissions)
        .innerJoin(exams, eq(submissions.examId, exams.id))
        .where(eq(submissions.userId, userId))
        .orderBy(desc(submissions.startedAt));
}

export async function listExamSubmissions(examId: string) {
    return db
        .select({
            id: submissions.id,
            userId: submissions.userId,
            name: users.name,
            email: users.email,
            status: submissions.status,
            score: submissions.score,
            startedAt: submissions.startedAt,
            submittedAt: submissions.submittedAt,
            autoSubmitted: submissions.autoSubmitted,
        })
        .from(submissions)
        .innerJoin(users, eq(submissions.userId, users.id))
        .where(eq(submissions.examId, examId))
        .orderBy(desc(submissions.submittedAt));
}

/** A marked paper: every question with what was answered and what it scored. */
export async function getSubmissionResult(submission: Submission) {
    const [exam] = await db.select().from(exams).where(eq(exams.id, submission.examId));
    const sections = await getExamPaper(submission.examId);
    const given = await db.select().from(answers).where(eq(answers.submissionId, submission.id));
    const answerByQuestion = new Map(given.map((a) => [a.questionId, a]));
    const [candidate] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, submission.userId));

    return {
        exam: { id: exam!.id, title: exam!.title, totalMarks: exam!.totalMarks, resultsVisible: exam!.resultsVisible },
        candidate: candidate ?? null,
        submission: {
            id: submission.id,
            status: submission.status,
            score: submission.score,
            submittedAt: submission.submittedAt,
            autoSubmitted: submission.autoSubmitted,
            evaluationError: submission.evaluationError,
        },
        sections: sections.map((section) => ({
            id: section.id,
            title: section.title,
            subject: section.subject,
            questions: section.questions.map((q) => {
                const answer = answerByQuestion.get(q.id);
                return {
                    id: q.id,
                    type: q.type,
                    description: q.description,
                    contentBlocks: q.contentBlocks,
                    marks: q.marks,
                    rubric: q.rubric,
                    options: q.options.map((o) => ({ id: o.id, value: o.value, isCode: o.isCode, isCorrect: o.isCorrect })),
                    answer: answer
                        ? {
                              id: answer.id,
                              optionIds: answer.optionIds ?? [],
                              textAnswer: answer.textAnswer,
                              isCorrect: answer.isCorrect,
                              marksAwarded: answer.marksAwarded,
                              feedback: answer.feedback,
                              markedBy: answer.markedBy,
                          }
                        : null,
                };
            }),
        })),
    };
}
