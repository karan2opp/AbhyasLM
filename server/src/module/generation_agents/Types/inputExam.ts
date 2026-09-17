import { z } from "zod";

export const QuestionTypeZodEnum = z.enum(["mcq", "descriptive"]);
export const DifficultyZodEnum = z.enum(["easy", "medium", "hard"]);

export const EducationCategoryZodEnum = z.enum([
    "Lower Middle School",
    "Middle School",
    "High School",
    "Senior Secondary",
    "Undergraduate",
    "Postgraduate",
    "Professional",
    "Not Specified",
]);

// "value" is the exact class/level as picked or typed by the user (e.g. "Class 8",
// "B.Tech 2nd Year"); "category" buckets it for the agent even when "value" is a
// free-typed string the category enum can't parse on its own.
export const EducationLevelZodSchema = z.object({
    value: z.string(),
    category: EducationCategoryZodEnum,
});

// A topic may be a plain name ("Variables") or an object carrying explicit
// subtopics and/or topic-specific instructions the teacher wants preserved
// ("{ topic: 'Variables', subtopics: ['Scope'], instructions: [...] }").
export const TopicInputZodSchema = z.union([
    z.string(),
    z.object({
        topic: z.string(),
        subtopics: z.array(z.string()).optional(),
    }),
]);

export type TopicInput = z.infer<typeof TopicInputZodSchema>;

export const ISectionZodSchema = z.object({
    name: z.string(),
    subject: z.string(),
    question_count: z.number().int().positive(),
    question_type: QuestionTypeZodEnum,
    // Marks awarded per single question in this section (not a section total).
    marks: z.number().positive(),
    topics: z.array(TopicInputZodSchema),
});

export const IInputExamZodSchema = z.object({
    title: z.string().optional(),
    instructions: z.array(z.string()).optional(),
    difficulty: DifficultyZodEnum.optional(),
    educationLevel: EducationLevelZodSchema.optional(),
    // The indexed book to build questions from ("From Source" mode). When set, subtopics are the book's own
    // subsections and questions are written from their text.
    bookId: z.string().optional(),
    sections: z.array(ISectionZodSchema),
});

export type QuestionType = z.infer<typeof QuestionTypeZodEnum>;
export type Difficulty = z.infer<typeof DifficultyZodEnum>;
export type EducationCategory = z.infer<typeof EducationCategoryZodEnum>;
export type EducationLevel = z.infer<typeof EducationLevelZodSchema>;
export type ISection = z.infer<typeof ISectionZodSchema>;
export type IInputExam = z.infer<typeof IInputExamZodSchema>;
