import { createId } from "@paralleldrive/cuid2";
import { inngest } from "../../../common/inngest/client.js";
import { resolveUserOpenAiKey } from "../../users/user.service.js";
import { runWithUserOpenAiKey } from "../../../common/utils/request_context.js";
import { generateSectionSubtopics } from "../agents/subtopics_agent.js";
import { generateTopicQuestions, type GenerateTopicQuestionsInput } from "../agents/generation_agent.js";
import { verifyAndRepairTopicQuestions } from "../topic_question_verification.js";
import { allocateSectionQuestions } from "../allocation.js";
import {
    getSession,
    saveBlueprint,
    markBlueprintFailed,
    saveSectionQuestions,
    markQuestionsCompleted,
    markQuestionsFailed,
} from "../exam_intent_session.service.js";
import type { ExamBlueprintSection, TopicWithSubtopics } from "../Types/outputSubtopics.js";
import type { GeneratedTopicQuestions } from "../Types/outputGeneration.js";
import type { TopicInput } from "../Types/inputExam.js";
import { generateBookSectionSubtopics, loadSourceMaterial, matchSubtopicsToBook } from "../../books/book_retrieval.js";

const topicName = (t: TopicInput): string => (typeof t === "string" ? t : t.topic);

/**
 * Trace-only function for the Exam Intent Agent. The conversation itself stays
 * a plain synchronous Express call (a chat needs an instant reply, which is
 * not what Inngest's event-driven model is for) — this just records a shadow
 * copy of each turn into Inngest purely so it's visible in the dashboard
 * alongside everything else, without gating the HTTP response on it.
 */
export const examIntentTurnTraceFunction = inngest.createFunction(
    {
        id: "exam-intent-turn-trace",
        triggers: [{ event: "generation-agent/exam-intent.turn" }],
    },
    async ({ event, step }) => {
        await step.run("record-turn", async () => {
            console.log("[exam-intent-turn-trace]", event.data);
            return event.data;
        });
    }
);

/**
 * Turns a completed Exam Intent session (examInput + summary) into a subtopic
 * blueprint. Batches one call per SECTION — never split across sections, so
 * every topic in a section is scored for relative weight against every other
 * topic in that same section in a single call, keeping weights comparable.
 * Each section is its own step: independently retried, independently visible
 * in the dashboard.
 */
export const generateBlueprintFunction = inngest.createFunction(
    {
        id: "generation-agent-generate-blueprint",
        triggers: [{ event: "generation-agent/blueprint.generate" }],
    },
    async ({ event, step }) => {
        const sessionId = event.data.sessionId as string;

        try {
            const session = await step.run("load-session", async () => {
                const s = await getSession(sessionId);
                if (!s) throw new Error(`Session ${sessionId} not found`);
                if (!s.summary) throw new Error(`Session ${sessionId} has no summary yet — intent conversation is not complete`);
                console.log(`[generation-agent-generate-blueprint] loaded session ${sessionId}, ${s.examInput.sections.length} section(s)`);
                return s;
            });

            const userOpenAiKey = await resolveUserOpenAiKey(session.createdBy);

            const examInput = session.examInput;
            const summary = session.summary!;
            const sectionResults: { name: string; subject: string; questionCount: number; topics: TopicWithSubtopics[]; unmatchedTopics?: string[] }[] = [];

            // The AsyncLocalStorage context from runWithUserOpenAiKey doesn't
            // survive across an Inngest step.run() boundary, so it's
            // re-established fresh inside every step whose callback makes an
            // AI call, rather than once around all of them.
            for (const section of examInput.sections) {
                const sectionTopicNames = section.topics.map(topicName);
                const topicInstructions = summary.topicSpecificInstructions.filter((t) =>
                    sectionTopicNames.includes(t.topic)
                );

                // From-source exams: subtopics are the book's own subsections, chosen per topic.
                if (examInput.bookId) {
                    const bookId = examInput.bookId;
                    const bookResult = await step.run(`book-subtopics-section-${section.name}`, () =>
                        runWithUserOpenAiKey(userOpenAiKey, async () => {
                            const planned = await generateBookSectionSubtopics(section, bookId, {
                                globalInstructions: summary.globalInstructions,
                                topicInstructions,
                                difficulty: examInput.difficulty,
                                educationLevel: examInput.educationLevel,
                            });
                            if (planned.topics.length === 0) {
                                throw new Error(`None of the topics in "${section.name}" were found in the selected book (${planned.unmatchedTopics.join(", ")}).`);
                            }
                            console.log(`[generation-agent-generate-blueprint] section "${section.name}": ${planned.topics.length} topic(s) matched in the book, ${planned.unmatchedTopics.length} not found`);
                            return planned;
                        })
                    );
                    sectionResults.push({
                        name: section.name,
                        subject: section.subject,
                        questionCount: section.question_count,
                        topics: bookResult.topics,
                        unmatchedTopics: bookResult.unmatchedTopics,
                    });
                    continue;
                }

                const result = await step.run(`subtopics-section-${section.name}`, () =>
                    runWithUserOpenAiKey(userOpenAiKey, async () => {
                        console.log(`[generation-agent-generate-blueprint] generating subtopics for section "${section.name}" (${sectionTopicNames.length} topic(s))`);
                        return generateSectionSubtopics(section, {
                            globalInstructions: summary.globalInstructions,
                            topicInstructions,
                            difficulty: examInput.difficulty,
                            educationLevel: examInput.educationLevel,
                        });
                    })
                );

                sectionResults.push({
                    name: section.name,
                    subject: section.subject,
                    questionCount: section.question_count,
                    topics: result.topics,
                });
            }

            await step.run("allocate-and-save-blueprint", async () => {
                const allocatedSections: ExamBlueprintSection[] = sectionResults.map((sr) => ({
                    name: sr.name,
                    subject: sr.subject,
                    topics: allocateSectionQuestions(sr.topics, sr.questionCount),
                    ...(sr.unmatchedTopics ? { unmatchedTopics: sr.unmatchedTopics } : {}),
                }));

                await saveBlueprint(sessionId, { sections: allocatedSections });
                console.log(`[generation-agent-generate-blueprint] allocated questions and saved blueprint for session ${sessionId}`);
            });
        } catch (err: any) {
            await markBlueprintFailed(sessionId, err?.message || "Unknown error generating blueprint");
            throw err;
        }
    }
);

// How many per-topic generation calls run at once. Topics beyond this count
// wait for a slot to free up rather than firing all at once.
const TOPIC_CONCURRENCY = 5;

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

// Inngest step ids must be stable, readable strings — collapse anything
// that isn't alphanumeric so section/topic names become safe id fragments.
const sanitizeStepId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");

/**
 * Generates every question in a finalized blueprint, one topic per model
 * call. Runs SECTION-WISE — a section's topics are fully generated (and
 * saved) before the next section starts — and within a section, topics run
 * TOPIC_CONCURRENCY at a time via parallel Inngest steps. Each topic call
 * only ever sees that topic's own subtopics + counts, never another topic's
 * data, so parallel calls can't cross-contaminate coverage. `retries: 3`
 * covers both real API failures and a wrong question count (the agent
 * throws on a count mismatch, which Inngest treats the same as any other
 * step failure and retries).
 */
export const generateQuestionsFunction = inngest.createFunction(
    {
        id: "generation-agent-generate-questions",
        retries: 3,
        triggers: [{ event: "generation-agent/questions.generate" }],
    },
    async ({ event, step }) => {
        const sessionId = event.data.sessionId as string;

        try {
            const session = await step.run("load-session-for-questions", async () => {
                const s = await getSession(sessionId);
                if (!s) throw new Error(`Session ${sessionId} not found`);
                if (!s.blueprint) throw new Error(`Session ${sessionId} has no blueprint yet`);
                if (!s.summary) throw new Error(`Session ${sessionId} has no summary yet`);
                return s;
            });

            const userOpenAiKey = await resolveUserOpenAiKey(session.createdBy);

            const examInput = session.examInput;
            const summary = session.summary!;
            const blueprint = session.blueprint!;

            for (const section of blueprint.sections) {
                const sectionInput = examInput.sections.find((s) => s.name === section.name);
                if (!sectionInput) throw new Error(`Section "${section.name}" is missing from the exam input`);

                const generatedTopics: GeneratedTopicQuestions[] = [];

                for (const group of chunk(section.topics, TOPIC_CONCURRENCY)) {
                    const results = await Promise.all(
                        group.map((topic) =>
                            step.run(`generate-topic-${sanitizeStepId(section.name)}-${sanitizeStepId(topic.topic)}`, () =>
                                runWithUserOpenAiKey(userOpenAiKey, async () => {
                                    const topicInstructions = summary.topicSpecificInstructions
                                        .filter((t) => t.topic === topic.topic)
                                        .flatMap((t) => t.instructions);

                                    const activeSubtopics = topic.subtopics.filter((s) => s.allocatedQuestions > 0);

                                    let sourceMaterial: { subtopic: string; text: string }[] | undefined;
                                    if (examInput.bookId) {
                                        // Subtopics added while reviewing the plan have no book source yet; match them now.
                                        const missing = activeSubtopics.filter((s) => !s.sourceNodeIds?.length).map((s) => s.name);
                                        const matched = await matchSubtopicsToBook(examInput.bookId, topic.topic, missing);
                                        sourceMaterial = await loadSourceMaterial(
                                            activeSubtopics.map((s) => ({
                                                name: s.name,
                                                sourceNodeIds: s.sourceNodeIds?.length ? s.sourceNodeIds : matched.get(s.name) ?? [],
                                            }))
                                        );
                                    }

                                    const generationInput: GenerateTopicQuestionsInput = {
                                        subject: sectionInput.subject,
                                        question_type: sectionInput.question_type,
                                        marks: sectionInput.marks,
                                        difficulty: examInput.difficulty,
                                        educationLevel: examInput.educationLevel,
                                        topic: topic.topic,
                                        subtopics: activeSubtopics.map((s) => ({ name: s.name, count: s.allocatedQuestions })),
                                        globalInstructions: summary.globalInstructions,
                                        topicInstructions,
                                        sourceMaterial,
                                    };
                                    const output = await generateTopicQuestions(generationInput);
                                    const verified = await verifyAndRepairTopicQuestions(generationInput, output.questions);

                                    const generatedTopic: GeneratedTopicQuestions = {
                                        topic: topic.topic,
                                        questions: verified.map((q) => ({ ...q, id: createId(), marks: sectionInput.marks })),
                                    };
                                    return generatedTopic;
                                })
                            )
                        )
                    );
                    generatedTopics.push(...results);
                }

                await step.run(`save-section-questions-${sanitizeStepId(section.name)}`, async () => {
                    const total = generatedTopics.reduce((n, t) => n + t.questions.length, 0);
                    await saveSectionQuestions(sessionId, { name: section.name, subject: section.subject, topics: generatedTopics });

                    console.log(`[generation-agent-generate-questions] saved ${total} question(s) for section "${section.name}"`);
                });
            }

            await step.run("finalize-questions", async () => {
                await markQuestionsCompleted(sessionId);
                console.log(`[generation-agent-generate-questions] all sections generated for session ${sessionId}`);
            });
        } catch (err: any) {
            await markQuestionsFailed(sessionId, err?.message || "Unknown error generating questions");
            throw err;
        }
    }
);

export const generationAgentFunctions = [
    examIntentTurnTraceFunction,
    generateBlueprintFunction,
    generateQuestionsFunction,
];
