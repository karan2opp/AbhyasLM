import { Router } from "express";
import {
    conversationTurnHandler,
    listSessionsHandler,
    getSessionHandler,
    triggerBlueprintGenerationHandler,
    getBlueprintStatusHandler,
    blueprintReviewTurnHandler,
    getBlueprintReviewHistoryHandler,
    triggerQuestionGenerationHandler,
    getQuestionsStatusHandler,
    questionReviewTurnHandler,
    getQuestionReviewHistoryHandler,
} from "./generation_agents.controller.js";
import {
    createRealtimeSessionHandler,
    executeIntentRealtimeToolHandler,
    executeReviewRealtimeToolHandler,
    executeQuestionReviewRealtimeToolHandler,
    logIntentTurnHandler,
    logReviewTurnHandler,
} from "./realtime_agents.controller.js";
import { requireExaminer } from "../../common/middleware/auth.middleware.js";

const router = Router();

router.get("/sessions", requireExaminer, listSessionsHandler);
router.get("/sessions/:sessionId", requireExaminer, getSessionHandler);

router.post("/conversation", requireExaminer, conversationTurnHandler);

router.post("/blueprint/generate", requireExaminer, triggerBlueprintGenerationHandler);
router.get("/blueprint/:sessionId", requireExaminer, getBlueprintStatusHandler);

router.post("/review/turn", requireExaminer, blueprintReviewTurnHandler);
router.get("/review/:sessionId", requireExaminer, getBlueprintReviewHistoryHandler);

router.post("/questions/generate", requireExaminer, triggerQuestionGenerationHandler);
router.get("/questions/:sessionId", requireExaminer, getQuestionsStatusHandler);

// Text counterpart of /realtime/question-review/tool.
router.post("/question-review/turn", requireExaminer, questionReviewTurnHandler);
router.get("/question-review/:sessionId", requireExaminer, getQuestionReviewHistoryHandler);

router.post("/realtime/session", requireExaminer, createRealtimeSessionHandler);
router.post("/realtime/intent/tool", requireExaminer, executeIntentRealtimeToolHandler);
router.post("/realtime/review/tool", requireExaminer, executeReviewRealtimeToolHandler);
router.post("/realtime/question-review/tool", requireExaminer, executeQuestionReviewRealtimeToolHandler);
router.post("/realtime/intent/log", requireExaminer, logIntentTurnHandler);
router.post("/realtime/review/log", requireExaminer, logReviewTurnHandler);

export const generationAgentsRouter = router;
export default router;
