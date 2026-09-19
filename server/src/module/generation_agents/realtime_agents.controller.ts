import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getSetting } from "../settings/settings.service.js";
import { ApiError } from "../../common/utils/ApiError.js";
import { IInputExamZodSchema } from "./Types/inputExam.js";
import { ConversationSummaryZodSchema } from "./Types/outputConversation.js";
import { getSystemPrompt as getIntentSystemPrompt, persistIntentMemories } from "./agents/exam_intent_agent.js";
import { getSystemPrompt as getReviewSystemPrompt, executeTool as executeReviewTool } from "./agents/blueprint_review_agent.js";
import { getSystemPrompt as getQuestionReviewSystemPrompt, executeTool as executeQuestionReviewTool } from "./agents/question_review_agent.js";
import {
    getIntentAgentRealtimeTools,
    getReviewAgentRealtimeTools,
    getQuestionReviewAgentRealtimeTools,
} from "./realtime/tool_schemas.js";
import { buildGenerationContextBySection } from "./session_context.util.js";
import {
    createSession,
    getSession,
    completeSession,
    appendMessage,
    appendReviewMessage,
    updateBlueprint,
} from "./exam_intent_session.service.js";
import { buildQuestionReviewContext } from "./question_review_context.util.js";
import { getReviewableQuestionsSession } from "./generation_agents.controller.js";
import { canAccessOwned } from "../../common/utils/access.js";
import { getUsableBook } from "../books/book_retrieval.js";

// Placed BEFORE the agent's own (often long) role prompt — models weight
// earlier instructions more reliably, and this rule must never get lost in
// a long system prompt. Kept short and absolute on purpose.
const ENGLISH_ONLY_DIRECTIVE = `CRITICAL RULE — applies to every single word you say, with no exceptions:
Speak and respond ONLY in English. Never switch languages, never mix in a word or phrase from another language, and never mirror the language of the teacher's audio — even if the transcription looks like it's in another language, is garbled, or you're not fully sure what was said. Always respond in English regardless. This rule overrides every other instruction below.`;

// This is a live spoken conversation, not a text chat — appended to both
// agents' existing (text-authored) system prompts rather than duplicating
// them, so voice and text always share the same underlying rules.
const VOICE_ADDENDUM = `
---
VOICE DELIVERY

This is a live spoken conversation, not a text chat.

- English only, always — every word, no exceptions, no mixing languages. This applies even if you think the teacher spoke another language or the transcription looks non-English.
- If you couldn't clearly understand what was said, say so in English and ask the teacher to repeat it — never guess and answer a different question than what was likely asked.
- Keep every response to one or two short sentences, the way a real conversation sounds.
- Never read out JSON, tool names, field names, or markdown formatting out loud.
- Never narrate that you are calling a tool ("let me update that now") — just speak naturally about the result once it's done.
- Ask exactly one thing at a time, and wait for the answer before moving on.
- Start the conversation yourself with a brief greeting and your first question — don't wait for the teacher to speak first.
`;

const CreateRealtimeSessionRequestZodSchema = z.object({
    agent: z.enum(["intent", "review", "question_review"]),
    sessionId: z.string().optional(),
    // Only used to start a brand-new intent session (mirrors the text flow's
    // conversationTurnHandler "no sessionId" branch).
    examInput: IInputExamZodSchema.optional(),
});

export const createRealtimeSessionHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = CreateRealtimeSessionRequestZodSchema.safeParse(req.body);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw ApiError.badRequest(`Invalid request body: ${issues}`);
        }
        const { agent, examInput } = parsed.data;
        let { sessionId } = parsed.data;
        const userId = req.user!.id;

        let instructions: string;
        let tools: unknown[];

        if (agent === "question_review") {
            if (!sessionId) throw ApiError.badRequest("sessionId is required for the question review agent");
            const session = await getReviewableQuestionsSession(sessionId, req.user!);
            instructions = `${ENGLISH_ONLY_DIRECTIVE}\n\n${getQuestionReviewSystemPrompt()}${VOICE_ADDENDUM}\n\nCURRENT EXAM STRUCTURE (sections, topics, and questions — each question has a unique "id"; each section has an "id"):\n${JSON.stringify(buildQuestionReviewContext(session.questions))}`;
            tools = getQuestionReviewAgentRealtimeTools();
        } else if (agent === "intent") {
            if (!sessionId) {
                if (!examInput) throw ApiError.badRequest("examInput is required to start a new intent session");
                if (examInput.bookId) {
                    await getUsableBook(examInput.bookId, { userId, role: req.user!.role });
                }
                const session = await createSession(examInput, userId);
                sessionId = session.id;
            } else {
                const session = await getSession(sessionId);
                if (!session) throw ApiError.notFound("Session not found");
                if (!canAccessOwned(session, req.user!)) throw ApiError.forbidden("Not your session");
            }
            instructions = `${ENGLISH_ONLY_DIRECTIVE}\n\n${getIntentSystemPrompt()}${VOICE_ADDENDUM}`;
            tools = getIntentAgentRealtimeTools();
        } else {
            if (!sessionId) throw ApiError.badRequest("sessionId is required for the review agent");
            const session = await getSession(sessionId);
            if (!session) throw ApiError.notFound("Session not found");
            if (!canAccessOwned(session, req.user!)) throw ApiError.forbidden("Not your session");
            if (session.blueprintStatus !== "completed" || !session.blueprint) {
                throw ApiError.badRequest("Blueprint is not ready yet");
            }
            instructions = `${ENGLISH_ONLY_DIRECTIVE}\n\n${getReviewSystemPrompt()}${VOICE_ADDENDUM}\n\nCURRENT EXAM BLUEPRINT (all sections, JSON):\n${JSON.stringify(session.blueprint.sections)}`;
            tools = getReviewAgentRealtimeTools();
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw ApiError.internal("OPENAI_API_KEY is not set on the server");
        const realtimeModel = getSetting("REALTIME_MODEL");
        const realtimeVoice = getSetting("REALTIME_VOICE");

        const openaiRes = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                session: {
                    type: "realtime",
                    model: realtimeModel,
                    instructions,
                    tools,
                    tool_choice: "auto",
                    audio: {
                        input: {
                            format: { type: "audio/pcm", rate: 24000 },
                            // Hints Whisper the input is English — without this it can
                            // occasionally mis-hear/mis-transcribe speech as another
                            // language, which then leads the model to answer in kind.
                            transcription: { model: "whisper-1", language: "en" },
                            turn_detection: { type: "server_vad" },
                        },
                        output: {
                            format: { type: "audio/pcm", rate: 24000 },
                            voice: realtimeVoice,
                        },
                    },
                    output_modalities: ["audio"],
                },
            }),
        });

        if (!openaiRes.ok) {
            const errText = await openaiRes.text().catch(() => "");
            console.error("[generation-agents] realtime client_secrets request failed:", openaiRes.status, errText);
            throw ApiError.internal("Could not start the realtime voice session (OpenAI request failed)");
        }

        const data: any = await openaiRes.json();
        // Defensive extraction — verify the exact response shape against a
        // real call and simplify this once confirmed; different Realtime API
        // revisions have nested this token slightly differently.
        const clientSecret = data.value || data.client_secret?.value || data.client_secret;
        if (!clientSecret) {
            console.error("[generation-agents] unexpected realtime client_secrets response shape:", JSON.stringify(data));
            throw ApiError.internal("Unexpected response from OpenAI while starting the voice session");
        }

        console.log(`[generation-agents] minted realtime session (agent: ${agent}, session: ${sessionId})`);
        res.status(201).json({ success: true, data: { sessionId, clientSecret, model: realtimeModel } });
    } catch (error) {
        next(error);
    }
};

const RealtimeToolCallRequestZodSchema = z.object({
    sessionId: z.string(),
    name: z.string(),
    argsRaw: z.string(),
});

export const executeIntentRealtimeToolHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = RealtimeToolCallRequestZodSchema.safeParse(req.body);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw ApiError.badRequest(`Invalid request body: ${issues}`);
        }
        const { sessionId, name, argsRaw } = parsed.data;

        const session = await getSession(sessionId);
        if (!session) throw ApiError.notFound("Session not found");
        if (!canAccessOwned(session, req.user!)) throw ApiError.forbidden("Not your session");

        if (name !== "save_exam_intent_summary") {
            res.status(200).json({ success: true, data: { output: { error: `Unknown tool "${name}".` } } });
            return;
        }

        const summary = ConversationSummaryZodSchema.parse(JSON.parse(argsRaw || "{}"));
        await completeSession(sessionId, summary);
        persistIntentMemories(summary, session.examInput.title, req.user!.id);

        console.log(`[generation-agents] realtime intent session ${sessionId} completed`);
        res.status(200).json({ success: true, data: { output: { done: true }, summary } });
    } catch (error) {
        next(error);
    }
};

export const executeReviewRealtimeToolHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = RealtimeToolCallRequestZodSchema.safeParse(req.body);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw ApiError.badRequest(`Invalid request body: ${issues}`);
        }
        const { sessionId, name, argsRaw } = parsed.data;

        const session = await getSession(sessionId);
        if (!session) throw ApiError.notFound("Session not found");
        if (!canAccessOwned(session, req.user!)) throw ApiError.forbidden("Not your session");
        if (session.blueprintStatus !== "completed" || !session.blueprint) {
            throw ApiError.badRequest("Blueprint is not ready yet");
        }

        if (name === "finish_review") {
            let summaryMessage = "Got it — the plan is finalized.";
            try {
                summaryMessage = JSON.parse(argsRaw || "{}").summary_message || summaryMessage;
            } catch {
                // keep default
            }
            res.status(200).json({
                success: true,
                data: { done: true, output: { done: true }, sections: session.blueprint.sections, message: summaryMessage },
            });
            return;
        }

        const generationContextBySection = buildGenerationContextBySection(session);
        const result = await executeReviewTool(session.blueprint.sections, name, argsRaw, generationContextBySection);
        await updateBlueprint(sessionId, { sections: result.sections });

        res.status(200).json({
            success: true,
            data: { done: false, output: { resultText: result.resultText }, sections: result.sections, changeLog: result.changeLog },
        });
    } catch (error) {
        next(error);
    }
};

// The questions are re-read after every change and returned, so the model's
// context (including any newly created question's id) stays current.
export const executeQuestionReviewRealtimeToolHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = RealtimeToolCallRequestZodSchema.safeParse(req.body);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw ApiError.badRequest(`Invalid request body: ${issues}`);
        }
        const { sessionId, name, argsRaw } = parsed.data;
        await getReviewableQuestionsSession(sessionId, req.user!);

        if (name === "finish_review") {
            let summaryMessage = "Got it — the questions are finalized.";
            try {
                summaryMessage = JSON.parse(argsRaw || "{}").summary_message || summaryMessage;
            } catch {
                // keep default
            }
            res.status(200).json({ success: true, data: { done: true, output: { done: true }, message: summaryMessage } });
            return;
        }

        const result = await executeQuestionReviewTool(name, argsRaw, sessionId);
        const { questions } = await getReviewableQuestionsSession(sessionId, req.user!);

        res.status(200).json({
            success: true,
            data: {
                done: false,
                output: { resultText: result.resultText },
                // Full structure for the client to render; a separate
                // trimmed copy for it to re-inject back into the live voice
                // conversation. The Realtime API accumulates conversation
                // history, so unlike a single text-turn request, sending the
                // full structure here would repeat it — bigger each time —
                // in the model's context on every single tool call for the
                // rest of the session.
                questions,
                reviewContext: buildQuestionReviewContext(questions),
                changeLog: result.changeLog,
            },
        });
    } catch (error) {
        next(error);
    }
};

const LogTurnRequestZodSchema = z.object({
    sessionId: z.string(),
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
});

// Persists one recognized utterance from a voice conversation into the same
// message tables the text flows use — so a review/intent session's history
// looks the same (and is loadable the same way) whether it was typed or spoken.
export const logIntentTurnHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = LogTurnRequestZodSchema.safeParse(req.body);
        if (!parsed.success) throw ApiError.badRequest("Invalid request body");
        const { sessionId, role, content } = parsed.data;

        const session = await getSession(sessionId);
        if (!session) throw ApiError.notFound("Session not found");
        if (!canAccessOwned(session, req.user!)) throw ApiError.forbidden("Not your session");

        await appendMessage(sessionId, role, content);
        res.status(200).json({ success: true, data: { ok: true } });
    } catch (error) {
        next(error);
    }
};

export const logReviewTurnHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = LogTurnRequestZodSchema.safeParse(req.body);
        if (!parsed.success) throw ApiError.badRequest("Invalid request body");
        const { sessionId, role, content } = parsed.data;

        const session = await getSession(sessionId);
        if (!session) throw ApiError.notFound("Session not found");
        if (!canAccessOwned(session, req.user!)) throw ApiError.forbidden("Not your session");

        await appendReviewMessage(sessionId, role, content);
        res.status(200).json({ success: true, data: { ok: true } });
    } catch (error) {
        next(error);
    }
};
