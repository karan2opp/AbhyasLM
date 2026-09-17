import { z } from "zod";

export const SubtopicZodSchema = z.object({
    name: z.string().describe("The name of the subtopic"),
    weight: z.number().min(0).max(1).describe("Normalized weight (0-1) of this subtopic; all subtopics under the same topic sum to 1"),
});

export const TopicWithSubtopicsZodSchema = z.object({
    topic: z.string().describe("The name of the topic, exactly as given in the input"),
    weight: z.number().min(0).max(1).describe("Normalized weight (0-1) of this topic; all topics in the section sum to 1"),
    subtopics: z.array(SubtopicZodSchema).describe("Subtopics under this topic"),
});

// One call's worth of output — always scoped to a single section, since
// batching happens per section (keeps weights comparable within the call).
export const SectionSubtopicsOutputZodSchema = z.object({
    topics: z.array(TopicWithSubtopicsZodSchema),
});

export type Subtopic = z.infer<typeof SubtopicZodSchema>;
export type TopicWithSubtopics = z.infer<typeof TopicWithSubtopicsZodSchema>;
export type SectionSubtopicsOutput = z.infer<typeof SectionSubtopicsOutputZodSchema>;

// Allocated versions — the agent's weight plus the actual question count
// derived from it. Allocation is deterministic post-processing (no LLM call),
// so these are never produced directly by the agent — only by allocation.ts,
// right before the blueprint is saved.
export const AllocatedSubtopicZodSchema = SubtopicZodSchema.extend({
    allocatedQuestions: z.number().int().min(0),
    // Book subsection node ids this subtopic comes from, for exams built from a book.
    sourceNodeIds: z.array(z.string()).optional(),
});

export const AllocatedTopicZodSchema = z.object({
    topic: z.string(),
    weight: z.number().min(0).max(1),
    allocatedQuestions: z.number().int().min(0),
    subtopics: z.array(AllocatedSubtopicZodSchema),
});

// Final assembled blueprint across every section, stored on the session once
// all per-section batches complete and allocation has run.
export const ExamBlueprintSectionZodSchema = z.object({
    name: z.string(),
    subject: z.string(),
    topics: z.array(AllocatedTopicZodSchema),
    // Teacher topics the book doesn't cover, left out of the plan so no questions are invented for them.
    unmatchedTopics: z.array(z.string()).optional(),
});

export const ExamBlueprintZodSchema = z.object({
    sections: z.array(ExamBlueprintSectionZodSchema),
});

export type AllocatedSubtopic = z.infer<typeof AllocatedSubtopicZodSchema>;
export type AllocatedTopic = z.infer<typeof AllocatedTopicZodSchema>;
export type ExamBlueprintSection = z.infer<typeof ExamBlueprintSectionZodSchema>;
export type ExamBlueprint = z.infer<typeof ExamBlueprintZodSchema>;
