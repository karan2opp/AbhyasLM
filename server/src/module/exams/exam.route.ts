import { Router } from "express";
import { requireAuth, requireExaminer, requireRole } from "../../common/middleware/auth.middleware.js";
import {
    deleteExamHandler,
    getExamHandler,
    getPaperHandler,
    getResultHandler,
    gradeSubmissionHandler,
    joinExamHandler,
    listExamSubmissionsHandler,
    listExamsHandler,
    listMySubmissionsHandler,
    publishExamHandler,
    saveAnswerHandler,
    submitExamHandler,
    updateExamHandler,
} from "./exam.controller.js";

const router = Router();

// Examiners (and admins) publish and manage exams.
router.post("/exams/publish", requireExaminer, publishExamHandler);
router.get("/exams", requireExaminer, listExamsHandler);
router.get("/exams/:examId", requireExaminer, getExamHandler);
router.patch("/exams/:examId", requireExaminer, updateExamHandler);
router.delete("/exams/:examId", requireExaminer, deleteExamHandler);
router.get("/exams/:examId/submissions", requireExaminer, listExamSubmissionsHandler);

// Candidates take them.
const candidateOnly = [requireAuth, requireRole("candidate", "admin")];
router.post("/exams/join", candidateOnly, joinExamHandler);
router.get("/submissions/me", candidateOnly, listMySubmissionsHandler);
router.get("/submissions/:submissionId/paper", candidateOnly, getPaperHandler);
router.post("/submissions/:submissionId/answers", candidateOnly, saveAnswerHandler);
router.post("/submissions/:submissionId/submit", candidateOnly, submitExamHandler);

// A marked paper: the candidate's own, or any attempt at an examiner's exam.
router.get("/submissions/:submissionId/result", requireAuth, getResultHandler);
router.patch("/submissions/:submissionId/grade", requireExaminer, gradeSubmissionHandler);

export default router;
