import { getClientForModel } from "../../../common/agent/openai.client.js";
import { getSetting } from "../../settings/settings.service.js";
import { zodResponseFormat } from "openai/helpers/zod";
import { GeneratedQuestionsOutputZodSchema, type GeneratedQuestionsOutput } from "../Types/outputGeneration.js";
import { getGenerationSystemPrompt } from "../prompt.js";
import type { QuestionType, Difficulty, EducationLevel } from "../Types/inputExam.js";

export interface GenerateTopicQuestionsInput {
    subject: string;
    question_type: QuestionType;
    marks: number;
    difficulty?: Difficulty | undefined;
    educationLevel?: EducationLevel | undefined;
    topic: string;
    // Only this topic's subtopics — never other topics' data, so the model
    // can't cross-contaminate coverage between topics generated in parallel.
    subtopics: { name: string; count: number }[];
    globalInstructions: string[];
    topicInstructions: string[];
    // Book text per subtopic, for exams built from a book. Questions must be answerable from it.
    sourceMaterial?: { subtopic: string; text: string }[] | undefined;
}

/**
 * Generates every question for ONE topic in a single call (all its subtopics
 * together, so the model can keep phrasing/difficulty consistent within the
 * topic). Throws if the returned count doesn't match what was asked for —
 * the caller (an Inngest step) retries on throw, so a bad count is corrected
 * by simply re-running the call rather than needing a separate repair pass.
 */
export async function generateTopicQuestions(input: GenerateTopicQuestionsInput): Promise<GeneratedQuestionsOutput> {
    const model = getSetting("GENERATION_MODEL");
    const client = await getClientForModel(model);
    const expectedCount = input.subtopics.reduce((sum, s) => sum + s.count, 0);

    const payload = {
        subject: input.subject,
        question_type: input.question_type,
        marks_per_question: input.marks,
        difficulty: input.difficulty ?? null,
        education_level: input.educationLevel?.value ?? null,
        topic: input.topic,
        subtopics: input.subtopics,
        global_instructions: input.globalInstructions,
        topic_instructions: input.topicInstructions,
        ...(input.sourceMaterial?.length ? { source_material: input.sourceMaterial } : {}),
    };

    const response = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: getGenerationSystemPrompt() },
            { role: "user", content: JSON.stringify(payload) },
        ],
        response_format: zodResponseFormat(GeneratedQuestionsOutputZodSchema, "generated_questions_output"),
    });

    const content = response.choices[0]?.message.content || "{}";
    const parsed = GeneratedQuestionsOutputZodSchema.parse(JSON.parse(content));

    if (parsed.questions.length !== expectedCount) {
        throw new Error(
            `Topic "${input.topic}" expected ${expectedCount} question(s) but the model returned ${parsed.questions.length}.`
        );
    }

    return parsed;
}
