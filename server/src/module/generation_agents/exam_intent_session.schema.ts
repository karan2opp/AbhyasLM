import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { users } from "../users/user.schema.js";
import type { IInputExam } from "./Types/inputExam.js";
import type { ConversationSummary } from "./Types/outputConversation.js";
import type { ExamBlueprint } from "./Types/outputSubtopics.js";
import type { GeneratedExam } from "./Types/outputGeneration.js";

// One row per Exam Intent Agent conversation. examInput is a snapshot of the
// form the teacher submitted (source of truth for re-running turns); summary
// is filled in once the conversation concludes (status -> "completed").
//
// blueprintStatus/blueprint/blueprintError track the next stage — subtopic
// generation — independently of the conversation's own status, since it runs
// later (via Inngest, polled from the client) once the conversation is done.
export const examIntentSessions = pgTable("exam_intent_sessions", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    createdBy: text("created_by").references(() => users.id).notNull(),
    examInput: jsonb("exam_input").$type<IInputExam>().notNull(),
    status: text("status").$type<"in_progress" | "completed">().default("in_progress").notNull(),
    summary: jsonb("summary").$type<ConversationSummary>(),
    blueprintStatus: text("blueprint_status").$type<"pending" | "in_progress" | "completed" | "failed">().default("pending").notNull(),
    blueprint: jsonb("blueprint").$type<ExamBlueprint>(),
    blueprintError: text("blueprint_error"),
    // Question generation runs section-by-section after the blueprint is
    // finalized; `questions` accumulates one section at a time so the UI can
    // show completed sections while later ones are still generating.
    questionsStatus: text("questions_status").$type<"pending" | "in_progress" | "completed" | "failed">().default("pending").notNull(),
    questions: jsonb("questions").$type<GeneratedExam>(),
    questionsError: text("questions_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Every turn exchanged in a session, in order — the durable transcript.
export const examIntentMessages = pgTable("exam_intent_messages", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sessionId: text("session_id").references(() => examIntentSessions.id, { onDelete: "cascade" }).notNull(),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Every turn exchanged with the Blueprint Review Agent, in order. Kept
// separate from examIntentMessages since it's a different conversation
// (starts only once the blueprint exists) — loaded back in on every turn so
// the agent remembers what was already discussed/changed in this session.
export const blueprintReviewMessages = pgTable("blueprint_review_messages", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sessionId: text("session_id").references(() => examIntentSessions.id, { onDelete: "cascade" }).notNull(),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Every turn exchanged with the Question Review Agent, in order. Starts only
// once the session's questions exist; the agent edits those stored questions.
export const questionReviewMessages = pgTable("question_review_messages", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sessionId: text("session_id").references(() => examIntentSessions.id, { onDelete: "cascade" }).notNull(),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ExamIntentSession = typeof examIntentSessions.$inferSelect;
export type NewExamIntentSession = typeof examIntentSessions.$inferInsert;
export type ExamIntentMessage = typeof examIntentMessages.$inferSelect;
export type NewExamIntentMessage = typeof examIntentMessages.$inferInsert;
export type BlueprintReviewMessage = typeof blueprintReviewMessages.$inferSelect;
export type NewBlueprintReviewMessage = typeof blueprintReviewMessages.$inferInsert;
export type QuestionReviewMessage = typeof questionReviewMessages.$inferSelect;
export type NewQuestionReviewMessage = typeof questionReviewMessages.$inferInsert;
