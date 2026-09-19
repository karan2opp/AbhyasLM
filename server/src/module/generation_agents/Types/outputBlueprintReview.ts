import { z } from "zod";

// A source/destination for redistributed questions: either specific
// (topic, subtopic) pairs the teacher named, or "auto" — let the code pick
// the lowest-weight subtopics across the whole section.
const TakeFromZodSchema = z.union([
    z.literal("auto"),
    z.array(z.object({ topic: z.string(), subtopic: z.string() })),
]);

// OpenAI's structured-outputs/tool mode requires every field to be present —
// "optional" alone isn't supported, fields must be nullable instead (same
// pattern used for the exam intent agent's summary field).
export const SetSubtopicCountArgsZodSchema = z.object({
    section: z.string().describe("The exact name of the exam section this subtopic belongs to"),
    topic: z.string().describe("The topic this subtopic belongs to"),
    subtopic: z.string().describe("The subtopic to change"),
    count: z.number().int().min(0).describe("The new question count for this subtopic"),
    take_from: TakeFromZodSchema.nullable().describe(
        "Required (non-null) when increasing count: where to take the extra questions from. Either specific {topic, subtopic} pairs the teacher named, or \"auto\" if they had no preference. Null when decreasing count."
    ),
});

export const SetTopicCountArgsZodSchema = z.object({
    section: z.string().describe("The exact name of the exam section this topic belongs to"),
    topic: z.string().describe("The topic to change"),
    count: z.number().int().min(0).describe("The new question count for this topic"),
    take_from: z.union([z.literal("auto"), z.array(z.object({ topic: z.string() }))]).nullable().describe(
        "Required (non-null) when increasing count: which other topics to take the extra questions from, or \"auto\". Null when decreasing count."
    ),
});

export const AddSubtopicArgsZodSchema = z.object({
    section: z.string().describe("The exact name of the exam section to add this subtopic in"),
    topic: z.string().describe("The topic to add this subtopic under"),
    name: z.string().describe("The new subtopic's name"),
    count: z.number().int().min(1).describe("How many questions to give the new subtopic"),
    take_from: TakeFromZodSchema.nullable().describe("Where to take the new subtopic's questions from — specific pairs, or \"auto\". Null only if unsure (defaults to auto)."),
});

export const DeleteSubtopicArgsZodSchema = z.object({
    section: z.string().describe("The exact name of the exam section this subtopic belongs to"),
    topic: z.string(),
    subtopic: z.string(),
});

export const AddTopicArgsZodSchema = z.object({
    section: z.string().describe("The exact name of the exam section to add this topic to"),
    name: z.string().describe("The new topic's name"),
    subtopics: z.array(z.string()).nullable().describe(
        "Only set this (non-null) if the teacher explicitly named the subtopics they want. Otherwise pass null — " +
        "the system will generate well-reasoned subtopics for this topic automatically (same quality " +
        "process used for the rest of the exam), rather than you inventing them yourself."
    ),
    count: z.number().int().min(1).describe("How many questions to give the new topic in total"),
    take_from: z.union([z.literal("auto"), z.array(z.object({ topic: z.string() }))]).nullable().describe(
        "Which other topics to take the new topic's questions from, or \"auto\". Null only if unsure (defaults to auto)."
    ),
});

export const DeleteTopicArgsZodSchema = z.object({
    section: z.string().describe("The exact name of the exam section this topic belongs to"),
    topic: z.string(),
});

export const IncreaseTotalQuestionCountArgsZodSchema = z.object({
    section: z.string().describe("The exact name of the exam section whose total question count should change"),
    new_total: z.number().int().min(1).describe("The section's new total question count (must be explicitly requested by the teacher, not inferred)"),
});

export type SetSubtopicCountArgs = z.infer<typeof SetSubtopicCountArgsZodSchema>;
export type SetTopicCountArgs = z.infer<typeof SetTopicCountArgsZodSchema>;
export type AddSubtopicArgs = z.infer<typeof AddSubtopicArgsZodSchema>;
export type DeleteSubtopicArgs = z.infer<typeof DeleteSubtopicArgsZodSchema>;
export type AddTopicArgs = z.infer<typeof AddTopicArgsZodSchema>;
export type DeleteTopicArgs = z.infer<typeof DeleteTopicArgsZodSchema>;
export type IncreaseTotalQuestionCountArgs = z.infer<typeof IncreaseTotalQuestionCountArgsZodSchema>;
