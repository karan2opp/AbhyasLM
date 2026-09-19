import { z } from "zod";

// Supplementary content shown between the question text and its options — a
// code listing, a table, or a list. Kept intentionally small: no html type,
// so nothing a model writes here can ever be rendered as markup.
const CodeContentBlockZodSchema = z.object({
    type: z.literal("code"),
    language: z.string().describe('Plain lowercase language name, e.g. "javascript", "python", "sql" — never a version number.'),
    code: z.string(),
});

const TableContentBlockZodSchema = z.object({
    type: z.literal("table"),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())).describe("Every row must have exactly as many cells as there are headers."),
});

const ListContentBlockZodSchema = z.object({
    type: z.literal("list"),
    ordered: z.boolean().describe("true only when sequence/order matters (steps, rankings); false otherwise."),
    items: z.array(z.string()),
});

export const QuestionContentBlockZodSchema = z.discriminatedUnion("type", [
    CodeContentBlockZodSchema,
    TableContentBlockZodSchema,
    ListContentBlockZodSchema,
]);

const baseQuestionFields = {
    topic: z.string().describe("The topic this question belongs to"),
    subtopic: z.string().describe("The subtopic this question belongs to"),
    // Required (not optional) — OpenAI's structured-output mode needs every
    // field present — but an empty array is the normal case; see the prompt's
    // CONTENT BLOCKS section for when to actually add one.
    content_blocks: z.array(QuestionContentBlockZodSchema).describe("Code/table/list content this question depends on. Empty for the large majority of questions."),
};

const GeneratedOptionZodSchema = z.object({
    text: z.string().describe("The option's text"),
    isCode: z.boolean().describe("true if this option IS a code snippet and should be rendered as code — false for an ordinary text option."),
});

const MCQQuestionZodSchema = z.object({
    ...baseQuestionFields,
    type: z.literal("mcq"),
    question_text: z.string().describe("The text of the multiple choice question"),
    options: z.array(GeneratedOptionZodSchema).min(4).max(4).describe("Exactly 4 multiple-choice options"),
    correct_option: z.enum(["A", "B", "C", "D"]).describe("The correct option key (A, B, C, or D)"),
});

const RubricCategoryZodSchema = z.object({
    name: z.string().describe("The name of the category (e.g. Definition, Concept Knowledge, Example, Correct Application, Depth of Reasoning)"),
    weight: z.number().describe("The weight of this category (float between 0 and 1); all categories for a question sum to 1"),
    key_points: z.array(z.string()).describe("Key points expected for this category"),
});

const DescriptiveQuestionZodSchema = z.object({
    ...baseQuestionFields,
    type: z.literal("descriptive"),
    question_text: z.string().describe("The text of the descriptive question"),
    rubric: z.object({ categories: z.array(RubricCategoryZodSchema) }).describe("The grading rubric for this question"),
});

// Raw model output — one call's worth of questions for a single topic. Marks
// aren't asked of the model: the section's marks-per-question is a known
// constant, attached deterministically when the result is saved.
export const GeneratedQuestionZodSchema = z.discriminatedUnion("type", [MCQQuestionZodSchema, DescriptiveQuestionZodSchema]);

export const GeneratedQuestionsOutputZodSchema = z.object({
    questions: z.array(GeneratedQuestionZodSchema).describe("All questions generated for this topic"),
});

export type QuestionContentBlock = z.infer<typeof QuestionContentBlockZodSchema>;
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionZodSchema>;
export type GeneratedQuestionsOutput = z.infer<typeof GeneratedQuestionsOutputZodSchema>;

// Stored/display shape — same question, plus the marks it was generated at
// and a stable id (assigned once, at generation time) so the Question Review
// Agent's tools can reference "this exact question" regardless of position.
const StoredQuestionZodSchema = z.discriminatedUnion("type", [
    MCQQuestionZodSchema.extend({ id: z.string(), marks: z.number() }),
    DescriptiveQuestionZodSchema.extend({ id: z.string(), marks: z.number() }),
]);

export const GeneratedTopicQuestionsZodSchema = z.object({
    topic: z.string(),
    questions: z.array(StoredQuestionZodSchema),
});

export const GeneratedSectionQuestionsZodSchema = z.object({
    name: z.string(),
    subject: z.string(),
    topics: z.array(GeneratedTopicQuestionsZodSchema),
});

export const GeneratedExamZodSchema = z.object({
    sections: z.array(GeneratedSectionQuestionsZodSchema),
});

export type StoredQuestion = z.infer<typeof StoredQuestionZodSchema>;
export type GeneratedTopicQuestions = z.infer<typeof GeneratedTopicQuestionsZodSchema>;
export type GeneratedSectionQuestions = z.infer<typeof GeneratedSectionQuestionsZodSchema>;
export type GeneratedExam = z.infer<typeof GeneratedExamZodSchema>;
