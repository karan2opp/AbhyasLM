import { createId } from "@paralleldrive/cuid2";
import { getSession, updateQuestions } from "./exam_intent_session.service.js";
import { generateTopicQuestions } from "./agents/generation_agent.js";
import { assertMcqAnswersAreCorrect, type McqToVerify } from "./question_review_verification.js";
import type { GeneratedExam, GeneratedSectionQuestions, StoredQuestion } from "./Types/outputGeneration.js";
import type {
    AddQuestionArgs,
    GenerateQuestionsArgs,
    RemoveQuestionArgs,
    UpdateQuestionTextArgs,
    UpdateQuestionOptionsArgs,
} from "./Types/outputQuestionReview.js";

const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

export interface QuestionReviewResult {
    changeLog: string[];
}

// Operates on the generated questions stored on the session (its `questions`
// JSON) — there are no separate question tables in this project. Each op
// loads the current tree, changes a copy, and saves it back in one write, so
// a failed check anywhere leaves the stored questions exactly as they were.
//
// Every path that can produce or change an MCQ's options runs them through
// assertMcqAnswersAreCorrect before saving. That call throws (rather than
// returning a pass/fail) if anything is wrong, so it can just be awaited
// inline — a failure surfaces as this whole apply* function throwing, which
// the agent sees as a tool error and can act on in the same turn, exactly
// like the structural checks below it.

async function loadQuestions(sessionId: string): Promise<GeneratedExam> {
    const session = await getSession(sessionId);
    if (!session?.questions) throw new Error("This session has no generated questions yet.");
    return structuredClone(session.questions);
}

function findSection(exam: GeneratedExam, sectionId: string): GeneratedSectionQuestions {
    const section = exam.sections.find((s) => s.name === sectionId);
    if (!section) throw new Error(`There is no section with id "${sectionId}".`);
    return section;
}

function findQuestion(exam: GeneratedExam, questionId: string) {
    for (const section of exam.sections) {
        for (const topic of section.topics) {
            const index = topic.questions.findIndex((q) => q.id === questionId);
            if (index !== -1) return { section, topic, index, question: topic.questions[index]! };
        }
    }
    throw new Error(`There is no question with id "${questionId}".`);
}

function dropEmptyTopics(exam: GeneratedExam) {
    for (const section of exam.sections) section.topics = section.topics.filter((t) => t.questions.length > 0);
}

/**
 * Puts new questions into a section under `topicName`. When replacing, the
 * old question is removed in the same change — and if the new questions share
 * its topic they take its exact place, so the numbers the teacher sees for
 * every other question stay the same.
 */
function placeQuestions(exam: GeneratedExam, sectionId: string, topicName: string, questions: StoredQuestion[], replacesQuestionId: string | null) {
    const section = findSection(exam, sectionId);

    if (replacesQuestionId) {
        const old = findQuestion(exam, replacesQuestionId);
        if (old.section === section && old.topic.topic === topicName) {
            old.topic.questions.splice(old.index, 1, ...questions);
            return;
        }
        old.topic.questions.splice(old.index, 1);
    }

    let topic = section.topics.find((t) => t.topic === topicName);
    if (!topic) {
        topic = { topic: topicName, questions: [] };
        section.topics.push(topic);
    }
    topic.questions.push(...questions);
}

export async function applyAddQuestion(args: AddQuestionArgs, sessionId: string): Promise<QuestionReviewResult> {
    const exam = await loadQuestions(sessionId);
    const base = { id: createId(), topic: args.topic, subtopic: args.subtopic, marks: args.marks, question_text: args.question_text, content_blocks: args.content_blocks };

    let question: StoredQuestion;
    if (args.type === "mcq") {
        if (!args.options || args.options.length !== 4 || !args.correct_option) {
            throw new Error("An MCQ question needs exactly 4 options and a correct_option.");
        }
        await assertMcqAnswersAreCorrect([
            {
                questionText: args.question_text,
                contentBlocks: args.content_blocks,
                options: args.options.map((opt, i) => ({ label: OPTION_LETTERS[i]!, text: opt.text })),
                claimedCorrectOption: args.correct_option,
            },
        ]);
        question = { ...base, type: "mcq", options: args.options, correct_option: args.correct_option };
    } else {
        if (!args.rubric_categories || args.rubric_categories.length === 0) {
            throw new Error("A descriptive question needs rubric_categories.");
        }
        question = { ...base, type: "descriptive", rubric: { categories: args.rubric_categories } };
    }

    placeQuestions(exam, args.section_id, args.topic, [question], args.replaces_question_id);
    dropEmptyTopics(exam);
    await updateQuestions(sessionId, exam);

    return {
        changeLog: [args.replaces_question_id ? `Replaced a question with a new ${args.type} question.` : `Added a new ${args.type} question.`],
    };
}

// Delegates to the real generation agent (same one the initial batch used) —
// count is already capped 1-3 by the zod schema, so this can never turn into
// a bulk regeneration no matter what the teacher asks for.
export async function applyGenerateQuestions(args: GenerateQuestionsArgs, sessionId: string): Promise<QuestionReviewResult> {
    if (args.replaces_question_id && args.count !== 1) {
        throw new Error("replaces_question_id only makes sense with count 1 — replacing one question with several has no single target. Generate the replacement alone first, then handle any extra questions as a separate addition.");
    }

    const exam = await loadQuestions(sessionId);
    // Checked before spending a generation call on a section or question that isn't there.
    findSection(exam, args.section_id);
    if (args.replaces_question_id) findQuestion(exam, args.replaces_question_id);

    const output = await generateTopicQuestions({
        subject: args.subject,
        question_type: args.question_type,
        marks: args.marks,
        topic: args.topic,
        subtopics: [{ name: args.subtopic, count: args.count }],
        globalInstructions: args.instructions || [],
        topicInstructions: [],
    });

    // One batched check for every MCQ this call produced, rather than one
    // API call per question — generate_questions alone can return up to 3.
    const mcqChecks: McqToVerify[] = output.questions
        .filter((q) => q.type === "mcq")
        .map((q) => ({
            questionText: q.question_text,
            contentBlocks: q.content_blocks,
            options: q.options.map((opt, i) => ({ label: OPTION_LETTERS[i]!, text: opt.text })),
            claimedCorrectOption: q.correct_option,
        }));
    await assertMcqAnswersAreCorrect(mcqChecks);

    const stored: StoredQuestion[] = output.questions.map((q) => ({ ...q, id: createId(), marks: args.marks }));
    placeQuestions(exam, args.section_id, args.topic, stored, args.replaces_question_id);
    dropEmptyTopics(exam);
    await updateQuestions(sessionId, exam);

    if (args.replaces_question_id) {
        return { changeLog: [`Replaced a question with a new AI-generated question for "${args.topic}" / "${args.subtopic}".`] };
    }
    return { changeLog: [`Generated ${stored.length} new question(s) for "${args.topic}" / "${args.subtopic}".`] };
}

export async function applyRemoveQuestion(args: RemoveQuestionArgs, sessionId: string): Promise<QuestionReviewResult> {
    const exam = await loadQuestions(sessionId);
    const found = findQuestion(exam, args.question_id);
    found.topic.questions.splice(found.index, 1);
    dropEmptyTopics(exam);
    await updateQuestions(sessionId, exam);
    return { changeLog: ["Removed a question."] };
}

export async function applyUpdateQuestionText(args: UpdateQuestionTextArgs, sessionId: string): Promise<QuestionReviewResult> {
    const exam = await loadQuestions(sessionId);
    const { question } = findQuestion(exam, args.question_id);
    const changingContent = args.content_blocks !== null;

    if (changingContent) {
        // The bug this guards against: content_blocks changes (a new code
        // snippet, a new scenario) while the OLD options or rubric — written
        // for the OLD content — are silently left in place. Require the
        // matching half of the question to be resupplied in the same call
        // rather than trusting a separate, later call to remember to do it.
        if (question.type === "mcq") {
            if (!args.options || args.options.length !== 4 || !args.correct_option) {
                throw new Error(
                    "Changing this question's content_blocks requires also providing the matching 4 options and correct_option in the same call — the old options were written for the old content and almost certainly don't apply to the new one."
                );
            }
            await assertMcqAnswersAreCorrect([
                {
                    questionText: args.question_text,
                    contentBlocks: args.content_blocks!,
                    options: args.options.map((opt, i) => ({ label: OPTION_LETTERS[i]!, text: opt.text })),
                    claimedCorrectOption: args.correct_option,
                },
            ]);
        } else if (!args.rubric_categories || args.rubric_categories.length === 0) {
            throw new Error(
                "Changing this question's content_blocks requires also providing a matching rubric_categories in the same call — the old rubric was written for the old content and may no longer fit."
            );
        }
    }

    question.question_text = args.question_text;
    if (changingContent) question.content_blocks = args.content_blocks!;
    if (question.type === "mcq" && args.options && args.correct_option) {
        question.options = args.options;
        question.correct_option = args.correct_option;
    }
    if (question.type === "descriptive" && args.rubric_categories) {
        question.rubric = { categories: args.rubric_categories };
    }
    await updateQuestions(sessionId, exam);

    const changed = changingContent ? "wording and content" : "wording";
    return { changeLog: [`Updated the ${changed} of a question.`] };
}

export async function applyUpdateQuestionOptions(args: UpdateQuestionOptionsArgs, sessionId: string): Promise<QuestionReviewResult> {
    const exam = await loadQuestions(sessionId);
    const { question } = findQuestion(exam, args.question_id);
    if (question.type !== "mcq") throw new Error("Only MCQ questions have options — this question is descriptive.");

    await assertMcqAnswersAreCorrect([
        {
            questionText: question.question_text,
            contentBlocks: question.content_blocks,
            options: args.options.map((opt, i) => ({ label: OPTION_LETTERS[i]!, text: opt.text })),
            claimedCorrectOption: args.correct_option,
        },
    ]);

    question.options = args.options;
    question.correct_option = args.correct_option;
    await updateQuestions(sessionId, exam);
    return { changeLog: ["Updated the options for a question."] };
}
