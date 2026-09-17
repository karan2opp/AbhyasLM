import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import {
    uploadDocumentHandler,
    listDocumentsHandler,
    getDocumentStatusHandler,
    renameDocumentHandler,
    deleteDocumentHandler,
    generateFromDocumentsHandler,
    searchQuestionBankHandler,
} from "./question_bank.controller.js";

const pdfUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf") cb(null, true);
        else cb(new Error("Only PDF files are allowed"));
    },
});

const router = Router();

router.post("/documents", requireAuth, pdfUpload.single("file"), uploadDocumentHandler);
router.get("/documents", requireAuth, listDocumentsHandler);
router.get("/documents/:documentId", requireAuth, getDocumentStatusHandler);
router.patch("/documents/:documentId", requireAuth, renameDocumentHandler);
router.delete("/documents/:documentId", requireAuth, deleteDocumentHandler);
router.post("/generate", requireAuth, generateFromDocumentsHandler);
router.post("/search", requireAuth, searchQuestionBankHandler);

export default router;
