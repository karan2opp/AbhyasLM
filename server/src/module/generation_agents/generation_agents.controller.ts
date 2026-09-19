import type { Request, Response, NextFunction } from "express";
import { examIntentAgentTurn, SKIP_QUESTION_SIGNAL, SKIP_ALL_SIGNAL, FORCE_CONCLUDE_SIGNAL } from "./agents/exam_intent_agent.js";
import { blueprintReviewAgentTurn } from "./agents/blueprint_review_agent.js";
import { IInputExamZodSchema } from "./Types/inputExam.js";
import { ExamBlueprintZodSchema } from "./Types/outputSubtopics.js";
import { buildGenerationContextBySection } from "./session_context.util.js";
import {
    createSession,
    getSession,
    getSessionHistory,
    listSessions,
    appendMessage,
    completeSession,
    setBlueprintInProgress,
    setQuestionsInProgress,
    updateBlueprint,
    getReviewHistory,
    appendReviewMessage,
    getQuestionReviewHistory,
    appendQuestionReviewMessage,
} from "./exam_intent_session.service.js";
import { questionReviewAgentTurn } from "./agents/question_review_agent.js";
import { buildQuestionReviewContext } from "./question_review_context.util.js";
import { inngest } from "../../common/inngest/client.js";
import { z } from "zod";
import { ApiError } from "../../common/utils/ApiError.js";
import { canAccessOwned } from "../../common/utils/access.js";
import { getUsableBook } from "../books/book_retrieval.js";

const ConversationTurnRequestZodSchema = z.object({
    // Required to start a new conversation (no sessionId); ignored once a
    // session exists — the DB snapshot from session start is the source of
    // truth from then on.
    examInput: IInputExamZodSchema.optional(),
    sessionId: z.string().optional(),
    // Required to continue an existing session — the teacher's reply.
    message: z.string().optional(),
    // The "Skip Question" / "Skip All Questions" chat buttons, as a control
    // signal rather than freeform text — mutually exclusive with `message`,
    // and only meaningful once a session exists (there's nothing to skip
    // before the first question has been asked).
    action: z.enum(["skip_question", "skip_all"]).optional(),
});

export const conversationTurnHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = ConversationTurnRequestZodSchema.safeParse(req.body);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw ApiError.badRequest(`Invalid request body: ${issues}`);
        }
        const { examInput, sessionId, message, action } = parsed.data;
        const userId = req.user!.id;

        let session;
        let effectiveMessage: string | null = null;
        if (!sessionId) {
            if (!examInput) throw ApiError.badRequest("examInput is required to start a conversation");
            if (action) throw ApiError.badRequest("action is only valid once a conversation has started");
            if (examInput.bookId) {
                await getUsableBook(examInput.bookId, { userId, role: req.user!.role });
            }
            session = await createSession(examInput, userId);
            console.log(`[generation-agents] started exam intent session ${session.id}`);
        } else {
            session = await getSession(sessionId);
            if (!session) throw ApiError.notFound("Session not found");
            if (session.createdBy !== userId) throw ApiError.forbidden("Not your session");

            if (action === "skip_question") {
                effectiveMessage = SKIP_QUESTION_SIGNAL;
            } else if (action === "skip_all") {
                effectiveMessage = SKIP_ALL_SIGNAL;
            } else {
                if (!message || !message.trim()) throw ApiError.badRequest("message is required to continue a conversation");
                effectiveMessage = message.trim();
            }
            await appendMessage(session.id, "user", effectiveMessage);
        }

        const history = sessionId ? await getSessionHistory(session.id) : [];
        console.log(`[generation-agents] exam intent turn (session ${session.id}, history length: ${history.length}${action ? `, action: ${action}` : ""})`);

        let result = await examIntentAgentTurn(session.examInput, history, userId);

        // "Skip all" must always end the conversation — regardless of whether
        // the model complies with the instruction on the first try. One
        // forced retry, then a hard-coded terminal fallback that can never
        // fail, so the teacher is never stuck unable to move past this stage.
        if (action === "skip_all" && !result.done) {
            const retryHistory = [...history, { role: "assistant" as const, content: result.message }, { role: "user" as const, content: FORCE_CONCLUDE_SIGNAL }];
            result = await examIntentAgentTurn(session.examInput, retryHistory, userId);

            if (!result.done) {
                console.warn(`[generation-agents] session ${session.id} did not conclude after [[FORCE_CONCLUDE]] — falling back to an empty summary`);
                result = {
                    done: true,
                    message: "Got it — moving on with what you've already shared.",
                    summary: { globalInstructions: [], topicSpecificInstructions: [] },
                };
            }
        }

        await appendMessage(session.id, "assistant", result.message);

        if (result.done && result.summary) {
            await completeSession(session.id, result.summary);
            console.log(`[generation-agents] exam intent session ${session.id} completed`);
        }

        // Fire-and-forget: shadow-trace this turn into Inngest for dashboard
        // visibility, without delaying the chat response on it.
        void inngest.send({
            name: "generation-agent/exam-intent.turn",
            data: {
                sessionId: session.id,
                turn: sessionId ? "continue" : "start",
                historyLength: history.length,
                userMessage: effectiveMessage,
                action: action ?? null,
                agentMessage: result.message,
                done: result.done,
                hasSummary: Boolean(result.summary),
            },
        }).catch((err) => {
            console.warn("[generation-agents] failed to send exam-intent trace event (Inngest dev server down?):", err?.message);
        });

        res.status(200).json({ success: true, data: { sessionId: session.id, ...result } });
    } catch (error) {
        next(error);
    }
};

const SESSION_STATUS_FILTERS = ["all", "draft", "published", "closed"] as const;

export const listSessionsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const search = typeof req.query.search === "string" ? req.query.search : undefined;
        const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
        const pageSize = req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : undefined;
        const status = SESSION_STATUS_FILTERS.includes(req.query.status as any) ? (req.query.status as (typeof SESSION_STATUS_FILTERS)[number]) : undefined;
        res.status(200).json({ success: true, data: await listSessions(req.user!, { search, page, pageSize, status }) });
    } catch (error) {
        next(error);
    }
};

// Everything a client needs to resume a session at whatever stage it's in,
// including the intent conversation so far.
export const getSessionHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const session = await getSession(String(req.params.sessionId));
        if (!session) throw ApiError.notFound("Session not found");
        if (!canAccessOwned(session, req.user!)) throw ApiError.forbidden("Not your session");

        const intentHistory = await getSessionHistory(session.id);
        res.status(200).json({ success: true, data: { ...session, intentHistory } });
    } catch (error) {
        next(error);
    }
};

export const triggerBlueprintGenerationHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { sessionId } = req.body || {};
        if (!sessionId || typeof sessionId !== "string") throw ApiError.badRequest("sessionId is required");

        const session = await getSession(sessionId);
        if (!session) throw ApiError.notFound("Session not found");
        if (!canAccessOwned(session, req.user!)) throw ApiError.forbidden("Not your session");
        if (session.status !== "completed") throw ApiError.badRequest("Intent conversation is not complete yet");

        await setBlueprintInProgress(session.id);
        try {
            await inngest.send({ name: "generation-agent/blueprint.generate", data: { sessionId: session.id } });
        } catch (sendError) {
            throw ApiError.internal("Could not reach the background job service (Inngest) — is it running?");
        }
        console.log(`[generation-agents] triggered blueprint generation for session ${session.id}`);

        res.status(202).json({ success: true, data: { sessionId: session.id, blueprintStatus: "in_progress" } });
    } catch (error) {
        next(error);
    }
};

export const getBlueprintStatusHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const sessionId = String(req.params.sessionId);
        const session = await getSession(sessionId);
        if (!session) throw ApiError.notFound("Session not found");
        if (!canAccessOwned(session, req.user!)) throw ApiError.forbidden("Not your session");

        res.status(200).json({
            success: true,
            data: {
                sessionId: session.id,
                blueprintStatus: session.blueprintStatus,
                blueprint: session.blueprint,
                blueprintError: session.blueprintError,
            },
        });
    } catch (error) {
        next(error);
    }
};

const BlueprintReviewTurnRequestZodSchema = z.object({
    sessionId: z.string(),
    message: z.string().min(1),
    // Optional override of the section tree to operate on — for a caller
    // (like the legacy tree-editor UI) whose own direct edits haven't been
    // persisted to this session's blueprint yet. When present, this becomes
    // the new source of truth (saved back at the end of the turn either way).
    sections: ExamBlueprintZodSchema.shape.sections.optional(),
});

export const blueprintReviewTurnHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = BlueprintReviewTurnRequestZodSchema.safeParse(req.body);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw ApiError.badRequest(`Invalid request body: ${issues}`);
        }
        const { sessionId, message, sections: sectionsOverride } = parsed.data;

        const session = await getSession(sessionId);
        if (!session) throw ApiError.notFound("Session not found");
        if (!canAccessOwned(session, req.user!)) throw ApiError.forbidden("Not your session");
        if (session.blueprintStatus !== "completed" || !session.blueprint) {
            throw ApiError.badRequest("Blueprint is not ready yet");
        }

        const startingSections = sectionsOverride ?? session.blueprint.sections;

        // Reloaded from Postgres every turn — this is what lets the agent
        // remember what was already discussed/changed earlier in this same
        // review conversation, across separate HTTP requests.
        const history = await getReviewHistory(sessionId);
        await appendReviewMessage(sessionId, "user", message);

        const generationContextBySection = buildGenerationContextBySection(session);

        const result = await blueprintReviewAgentTurn(startingSections, generationContextBySection, history, message);

        await appendReviewMessage(sessionId, "assistant", result.message);
        // Persisted every turn (not just when done) so the next turn — or a
        // page refresh — always resumes from the latest tool-call state.
        await updateBlueprint(sessionId, { sections: result.sections });

        console.log(`[generation-agents] blueprint review turn (session ${sessionId}, history length: ${history.length}, done: ${result.done})`);

        res.status(200).json({
            success: true,
            data: {
                sessionId,
                message: result.message,
                sections: result.sections,
                done: result.done,
                changeLog: result.changeLog,
            },
        });
    } catch (error) {
        next(error);
    }
};

export const getBlueprintReviewHistoryHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const sessionId = String(req.params.sessionId);
        const session = await getSession(sessionId);
        if (!session) throw ApiError.notFound("Session not found");
        if (!canAccessOwned(session, req.user!)) throw ApiError.forbidden("Not your session");

        const history = await getReviewHistory(sessionId);
        res.status(200).json({
            success: true,
            data: { sessionId, history, blueprint: session.blueprint },
        });
    } catch (error) {
        next(error);
    }
};

const TriggerQuestionGenerationRequestZodSchema = z.object({
    sessionId: z.string(),
    // Optional final override — lets a caller sync last-minute manual edits
    // (e.g. from a direct tree editor) into the blueprint right before
    // generation starts, without a separate round trip.
    sections: ExamBlueprintZodSchema.shape.sections.optional(),
});

const QuestionReviewTurnRequestZodSchema = z.object({
    sessionId: z.string(),
    message: z.string().min(1),
});

/** A session the caller (owner or admin) may reach, whose questions have finished generating — what the Question Review Agent edits. */
export async function getReviewableQuestionsSession(sessionId: string, requester: { id: string; role: string | null }) {
    const session = await getSession(sessionId);
    if (!session) throw ApiError.notFound("Session not found");
    if (!canAccessOwned(session, requester)) throw ApiError.forbidden("Not your session");
    if (session.questionsStatus !== "completed" || !session.questions) {
        throw ApiError.badRequest("Questions are not ready yet");
    }
    return { ...session, questions: session.questions };
}

// Text-chat turn for the Question Review Agent — the non-voice path to the
// same agent. Its tools save straight to the session's questions, so the
// current structure is re-read after the turn.
export const questionReviewTurnHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = QuestionReviewTurnRequestZodSchema.safeParse(req.body);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw ApiError.badRequest(`Invalid request body: ${issues}`);
        }
        const { sessionId, message } = parsed.data;

        const session = await getReviewableQuestionsSession(sessionId, req.user!);

        // Loaded before the new message is stored, so the agent sees the
        // conversation as it stood, then this turn on top — the same ordering
        // the blueprint review agent uses.
        const history = await getQuestionReviewHistory(sessionId);
        await appendQuestionReviewMessage(sessionId, "user", message);

        // Trimmed for the MODEL only — the full questions (returned below) are
        // what the client renders.
        const result = await questionReviewAgentTurn(buildQuestionReviewContext(session.questions), history, message, sessionId);
        await appendQuestionReviewMessage(sessionId, "assistant", result.message);

        // Re-read after the turn so the client renders what was actually
        // written, not what it had before the edits.
        const updated = await getSession(sessionId);

        console.log(`[generation-agents] question review turn (session ${sessionId}, ${result.changeLog.length} change(s), done: ${result.done})`);

        res.status(200).json({
            success: true,
            data: {
                sessionId,
                message: result.message,
                done: result.done,
                changeLog: result.changeLog,
                questions: updated?.questions ?? null,
            },
        });
    } catch (error) {
        next(error);
    }
};

// Lets the chat panel restore its transcript after a refresh — the agent
// already remembers, so the UI should too.
export const getQuestionReviewHistoryHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const sessionId = String(req.params.sessionId);
        const session = await getSession(sessionId);
        if (!session) throw ApiError.notFound("Session not found");
        if (!canAccessOwned(session, req.user!)) throw ApiError.forbidden("Not your session");

        const history = await getQuestionReviewHistory(sessionId);
        res.status(200).json({ success: true, data: { sessionId, history, questions: session.questions } });
    } catch (error) {
        next(error);
    }
};

export const triggerQuestionGenerationHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = TriggerQuestionGenerationRequestZodSchema.safeParse(req.body);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw ApiError.badRequest(`Invalid request body: ${issues}`);
        }
        const { sessionId, sections: sectionsOverride } = parsed.data;

        const session = await getSession(sessionId);
        if (!session) throw ApiError.notFound("Session not found");
        if (!canAccessOwned(session, req.user!)) throw ApiError.forbidden("Not your session");
        if (session.blueprintStatus !== "completed" || !session.blueprint) {
            throw ApiError.badRequest("Blueprint is not ready yet");
        }

        if (sectionsOverride) {
            await updateBlueprint(session.id, { sections: sectionsOverride });
        }

        await setQuestionsInProgress(session.id);
        try {
            await inngest.send({ name: "generation-agent/questions.generate", data: { sessionId: session.id } });
        } catch (sendError) {
            throw ApiError.internal("Could not reach the background job service (Inngest) — is it running?");
        }
        console.log(`[generation-agents] triggered question generation for session ${session.id}`);

        res.status(202).json({ success: true, data: { sessionId: session.id, questionsStatus: "in_progress" } });
    } catch (error) {
        next(error);
    }
};

export const getQuestionsStatusHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const sessionId = String(req.params.sessionId);
        const session = await getSession(sessionId);
        if (!session) throw ApiError.notFound("Session not found");
        if (!canAccessOwned(session, req.user!)) throw ApiError.forbidden("Not your session");

        res.status(200).json({
            success: true,
            data: {
                sessionId: session.id,
                questionsStatus: session.questionsStatus,
                questions: session.questions,
                questionsError: session.questionsError,
            },
        });
    } catch (error) {
        next(error);
    }
};
