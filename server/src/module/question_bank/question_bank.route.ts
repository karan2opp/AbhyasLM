import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { requireExaminer } from "../../common/middleware/auth.middleware.js";
import { getSetting } from "../settings/settings.service.js";
import {
    uploadDocumentHandler,
    listDocumentsHandler,
    getDocumentStatusHandler,
    renameDocumentHandler,
    deleteDocumentHandler,
    generateFromDocumentsHandler,
    searchQuestionBankHandler,
} from "./question_bank.controller.js";

// Built fresh per request so an admin's upload-limit change (see the
// settings page) applies immediately, without restarting the server.
const pdfUpload = (req: Request, res: Response, next: NextFunction) =>
    multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: Number(getSetting("QUESTION_BANK_MAX_MB")) * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (file.mimetype === "application/pdf") cb(null, true);
            else cb(new Error("Only PDF files are allowed"));
        },
    }).single("file")(req, res, next);

const router = Router();

router.post("/documents", requireExaminer, pdfUpload, uploadDocumentHandler);
router.get("/documents", requireExaminer, listDocumentsHandler);
router.get("/documents/:documentId", requireExaminer, getDocumentStatusHandler);
router.patch("/documents/:documentId", requireExaminer, renameDocumentHandler);
router.delete("/documents/:documentId", requireExaminer, deleteDocumentHandler);
router.post("/generate", requireExaminer, generateFromDocumentsHandler);
router.post("/search", requireExaminer, searchQuestionBankHandler);

export default router;
