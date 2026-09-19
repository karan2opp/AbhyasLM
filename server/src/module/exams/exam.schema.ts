import { pgTable, text, integer, doublePrecision, timestamp, boolean, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { users } from "../users/user.schema.js";
import type { QuestionContentBlock } from "../generation_agents/Types/outputGeneration.js";

export type ExamStatus = "draft" | "published" | "closed";
export type QuestionKind = "mcq" | "descriptive";
export type SubmissionStatus = "in_progress" | "evaluating" | "submitted";

export interface QuestionRubric {
    categories: { name: string; weight: number; key_points: string[] }[];
}

/**
 * A published exam: the frozen copy of a generation session's questions that
 * candidates actually sit. Editing the session afterwards doesn't change an
 * exam that has already been published.
 */
export const exams = pgTable("exams", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    createdBy: text("created_by").references(() => users.id).notNull(),
    // Where the questions came from; kept for provenance, and null once that session is deleted.
    sessionId: text("session_id"),
    title: text("title").notNull(),
    instructions: text("instructions").array(),
    durationMinutes: integer("duration_minutes").notNull(),
    // Candidates join with this code; unique across the install.
    joinCode: text("join_code").notNull().unique(),
    totalMarks: doublePrecision("total_marks").notNull(),
    // Optional window. Outside it, nobody can start the exam.
    opensAt: timestamp("opens_at"),
    closesAt: timestamp("closes_at"),
    status: text("status").$type<ExamStatus>().default("draft").notNull(),
    // Whether candidates see marks and feedback as soon as grading finishes.
    resultsVisible: boolean("results_visible").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const examSections = pgTable("exam_sections", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    examId: text("exam_id").references(() => exams.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    position: integer("position").notNull(),
});

export const examQuestions = pgTable("exam_questions", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    examId: text("exam_id").references(() => exams.id, { onDelete: "cascade" }).notNull(),
    sectionId: text("section_id").references(() => examSections.id, { onDelete: "cascade" }).notNull(),
    type: text("type").$type<QuestionKind>().notNull(),
    // The question as printed, plus any code/table/list it depends on.
    description: text("description").notNull(),
    contentBlocks: jsonb("content_blocks").$type<QuestionContentBlock[]>().default([]).notNull(),
    topic: text("topic"),
    subtopic: text("subtopic"),
    marks: doublePrecision("marks").notNull(),
    // Descriptive questions only — what the AI grader marks against.
    rubric: jsonb("rubric").$type<QuestionRubric>(),
    // The question's place in its section. Set once, so "question 4" always
    // means the same question however the rows come back.
    position: integer("position").notNull(),
}, (table) => [
    index("exam_questions_exam_position_idx").on(table.examId, table.position),
]);

export const examOptions = pgTable("exam_options", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    questionId: text("question_id").references(() => examQuestions.id, { onDelete: "cascade" }).notNull(),
    value: text("value").notNull(),
    // Rendered as code rather than plain text.
    isCode: boolean("is_code").default(false).notNull(),
    // Never sent to a candidate while they're sitting the exam.
    isCorrect: boolean("is_correct").default(false).notNull(),
    position: integer("position").notNull(),
});

/** One attempt. A candidate gets one per exam. */
export const submissions = pgTable("submissions", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    examId: text("exam_id").references(() => exams.id, { onDelete: "cascade" }).notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    status: text("status").$type<SubmissionStatus>().default("in_progress").notNull(),
    // Fixed when the attempt starts: startedAt + the exam's duration, capped by
    // its closing time. Answers are refused after it.
    startedAt: timestamp("started_at").defaultNow().notNull(),
    deadlineAt: timestamp("deadline_at").notNull(),
    submittedAt: timestamp("submitted_at"),
    // True when the deadline passed rather than the candidate pressing submit.
    autoSubmitted: boolean("auto_submitted").default(false).notNull(),
    score: doublePrecision("score"),
    evaluationError: text("evaluation_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("submissions_exam_user_idx").on(table.examId, table.userId),
]);

export const answers = pgTable("answers", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    submissionId: text("submission_id").references(() => submissions.id, { onDelete: "cascade" }).notNull(),
    questionId: text("question_id").references(() => examQuestions.id, { onDelete: "cascade" }).notNull(),
    // Chosen option ids (MCQ) or the written answer (descriptive).
    optionIds: text("option_ids").array(),
    textAnswer: text("text_answer"),
    isCorrect: boolean("is_correct"),
    marksAwarded: doublePrecision("marks_awarded"),
    feedback: text("feedback"),
    // An examiner can always override an AI mark; AI grading never overwrites
    // an examiner's.
    markedBy: text("marked_by").$type<"auto" | "ai" | "examiner">(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("answers_submission_question_idx").on(table.submissionId, table.questionId),
]);

export type Exam = typeof exams.$inferSelect;
export type ExamSection = typeof examSections.$inferSelect;
export type ExamQuestion = typeof examQuestions.$inferSelect;
export type ExamOption = typeof examOptions.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Answer = typeof answers.$inferSelect;
