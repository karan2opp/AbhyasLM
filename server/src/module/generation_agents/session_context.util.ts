import type { ExamIntentSession } from "./exam_intent_session.schema.js";
import type { AddTopicGenerationContext } from "./blueprint_edit_ops.js";

// Shared by the text-based review turn handler and the realtime voice tool
// handler — both need the same per-section context (question_type, marks,
// difficulty, educationLevel, globalInstructions) to fund a newly added
// topic's subtopics via the real subtopics agent.
export function buildGenerationContextBySection(session: ExamIntentSession): Record<string, AddTopicGenerationContext> {
    const map: Record<string, AddTopicGenerationContext> = {};
    for (const section of session.examInput.sections) {
        map[section.name] = {
            question_type: section.question_type,
            marks: section.marks,
            difficulty: session.examInput.difficulty,
            educationLevel: session.examInput.educationLevel,
            globalInstructions: session.summary?.globalInstructions || [],
        };
    }
    return map;
}
