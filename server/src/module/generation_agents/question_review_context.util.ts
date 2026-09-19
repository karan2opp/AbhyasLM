import type { GeneratedExam, StoredQuestion } from "./Types/outputGeneration.js";

// Builds the minimal view of a session's generated questions handed to the
// Question Review Agent — used by both the text turn handler and the
// realtime/voice session, so both see the same trimmed shape.
//
// Keeps only the fields the agent acts on: id, number, type, subtopic, text,
// marks, options/rubric, and content_blocks only when non-empty. The topic is
// carried by the grouping, not repeated on every question.

function trimQuestion(q: StoredQuestion, number: number) {
    const trimmed: Record<string, unknown> = {
        // "number" is what the teacher sees on screen and says out loud
        // ("question 9") — the id is what the agent's tools take. Never the
        // same value, and the agent must never surface the id to the
        // teacher; see the prompt's ID HANDLING section.
        number,
        id: q.id,
        type: q.type,
        subtopic: q.subtopic,
        text: q.question_text,
        marks: q.marks,
    };

    if (q.content_blocks.length > 0) trimmed.contentBlocks = q.content_blocks;

    if (q.type === "mcq") {
        trimmed.options = q.options.map((o, i) => ({
            label: "ABCD"[i],
            text: o.text,
            isCorrect: "ABCD"[i] === q.correct_option,
            ...(o.isCode && { isCode: true }),
        }));
    } else {
        trimmed.rubric = q.rubric;
    }

    return trimmed;
}

/**
 * Questions are numbered 1, 2, 3… within each section, in stored order across
 * its topics — a client must number them the same way so "question 9" means
 * the same question to the teacher and to the agent.
 */
export function buildQuestionReviewContext(exam: GeneratedExam) {
    return exam.sections.map((section) => {
        let number = 0;
        return {
            id: section.name,
            subject: section.subject,
            topics: section.topics.map((topic) => ({
                topic: topic.topic,
                questions: topic.questions.map((q) => trimQuestion(q, ++number)),
            })),
        };
    });
}
