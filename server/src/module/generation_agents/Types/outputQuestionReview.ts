import { z } from "zod";

export const RubricCategoryInputZodSchema = z.object({
    name: z.string(),
    weight: z.number(),
    key_points: z.array(z.string()),
});

// Same three shapes as the generation agent's output (outputGeneration.ts) —
// kept as a separate definition (this agent has its own independent tool
// schemas) but must stay structurally compatible with QuestionContentBlock,
// since both end up in the same stored question.
export const ContentBlockInputZodSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("code"), language: z.string(), code: z.string() }),
    z.object({ type: z.literal("table"), headers: z.array(z.string()), rows: z.array(z.array(z.string())) }),
    z.object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(z.string()) }),
]);

export const OptionInputZodSchema = z.object({
    text: z.string(),
    isCode: z.boolean().describe("true only if this option IS a code snippet — false for an ordinary text option."),
});

// Operates on the generated questions stored on the session (see
// question_review_ops.ts). section_id comes from the current exam structure
// given to the agent as context; question_id from its question list.

// Manual: the teacher dictates the exact question — no LLM call, just record
// it. Exactly one of (options + correct_option) or (rubric_categories) must
// be provided depending on `type`; the other pair is null.
export const AddQuestionArgsZodSchema = z.object({
    section_id: z.string().describe("The id of the exam section this question belongs to"),
    topic: z.string().describe("The topic this question belongs to — an existing topic in the section when one fits, otherwise a short new topic name"),
    subtopic: z.string().describe("The subtopic this question covers"),
    type: z.enum(["mcq", "descriptive"]),
    question_text: z.string().describe("The exact question text, as dictated by the teacher"),
    marks: z.number().min(0.5).describe("Marks for this question"),
    options: z.array(OptionInputZodSchema).nullable().describe("Exactly 4 options — required (non-null) when type is mcq, null when descriptive"),
    correct_option: z.enum(["A", "B", "C", "D"]).nullable().describe("Required (non-null) when type is mcq, null when descriptive"),
    rubric_categories: z
        .array(RubricCategoryInputZodSchema)
        .nullable()
        .describe("Required (non-null) when type is descriptive, null when mcq"),
    content_blocks: z
        .array(ContentBlockInputZodSchema)
        .describe("Code/table/list content the teacher dictated alongside the question. Empty array when there is none — most questions have none."),
    // Makes a REPLACE atomic: the old question is only removed once the new
    // one is created (and, for MCQ, has passed its correctness check) — so a
    // "replace" can never leave the exam with both, or with neither. Never
    // call remove_question separately for this same question when you set
    // this; it is handled as part of this same call.
    replaces_question_id: z
        .string()
        .nullable()
        .describe("The id of an existing question this new one REPLACES, if the teacher asked to replace/swap a question rather than just add one alongside it. null for an ordinary addition."),
});

// AI-generated: hard-capped at 3 per call so one request never turns into a
// bulk regeneration — the teacher can always ask again for more.
export const GenerateQuestionsArgsZodSchema = z.object({
    section_id: z.string().describe("The id of the exam section to generate into"),
    subject: z.string().describe("The subject to write the question(s) in (e.g. JavaScript)"),
    question_type: z.enum(["mcq", "descriptive"]),
    topic: z.string().describe("The topic these questions are about"),
    subtopic: z.string().describe("The specific subtopic to generate new question(s) for"),
    marks: z.number().min(0.5).describe("Marks for each generated question"),
    count: z.number().int().min(1).max(3).describe("How many new questions to generate — 1 to 3 at a time, never more"),
    instructions: z.array(z.string()).nullable().describe("Extra guidance for these specific questions (e.g. \"make them harder\"), or null"),
    // Same atomic-replace mechanism as add_question. Only meaningful when
    // count is 1 — replacing one question with several doesn't have a
    // single well-defined target, so leave this null and remove the old one
    // separately in that case.
    replaces_question_id: z
        .string()
        .nullable()
        .describe("The id of an existing question this replaces, when the teacher asked to replace it with a NEW AI-written one (count must be 1). null for an ordinary addition."),
});

export const RemoveQuestionArgsZodSchema = z.object({
    question_id: z.string().describe("The id of the question to remove, from the current question list"),
});

export const UpdateQuestionTextArgsZodSchema = z.object({
    question_id: z.string().describe("The id of the question to reword"),
    question_text: z.string().describe("The new question text"),
    content_blocks: z
        .array(ContentBlockInputZodSchema)
        .nullable()
        .describe("null to leave this question's code/table/list content exactly as it is. An array (possibly empty, to remove them) ONLY when the teacher specifically asked to add, change, or remove that content."),
    // Whenever content_blocks is non-null (being changed) on an MCQ question,
    // its old options were written for the OLD content and almost certainly
    // no longer make sense — options/correct_option MUST be supplied together
    // with the new content_blocks in that case (never left as the stale set).
    // null only when content_blocks is also null, or the question is
    // descriptive.
    options: z
        .array(OptionInputZodSchema)
        .nullable()
        .describe("Required (non-null, exactly 4) whenever content_blocks is also being changed on an MCQ question. null otherwise."),
    correct_option: z
        .enum(["A", "B", "C", "D"])
        .nullable()
        .describe("Required (non-null) whenever options is provided. null otherwise."),
    // Same requirement, mirrored for descriptive questions: if the content a
    // rubric was written against changes, the rubric's key_points may no
    // longer match what the question is actually asking about.
    rubric_categories: z
        .array(RubricCategoryInputZodSchema)
        .nullable()
        .describe("Required (non-null) whenever content_blocks is also being changed on a descriptive question. null otherwise."),
});

export const UpdateQuestionOptionsArgsZodSchema = z.object({
    question_id: z.string().describe("The id of the MCQ question to change — must already be type mcq"),
    options: z.array(OptionInputZodSchema).min(4).max(4).describe("The new set of exactly 4 options"),
    correct_option: z.enum(["A", "B", "C", "D"]).describe("The correct option key among the new options"),
});

export type AddQuestionArgs = z.infer<typeof AddQuestionArgsZodSchema>;
export type GenerateQuestionsArgs = z.infer<typeof GenerateQuestionsArgsZodSchema>;
export type RemoveQuestionArgs = z.infer<typeof RemoveQuestionArgsZodSchema>;
export type UpdateQuestionTextArgs = z.infer<typeof UpdateQuestionTextArgsZodSchema>;
export type UpdateQuestionOptionsArgs = z.infer<typeof UpdateQuestionOptionsArgsZodSchema>;
