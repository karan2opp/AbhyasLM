import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ApiError } from "../../common/utils/ApiError.js";
import { inngest } from "../../common/inngest/client.js";
import { uploadRawToCloudinary, deleteFromCloudinaryByUrl } from "../../common/config/cloudinary.js";
import {
    createDocument,
    getDocument,
    getDocumentsByIds,
    listAccessibleDocuments,
    canAccessDocument,
    renameDocument,
    getChunksByDocument,
    deleteDocument,
    searchQuestionBank,
} from "./question_bank.service.js";
import { deleteQuestionBankPointsByDocument, type QuestionBankAccess } from "./qdrant_client.js";
import { generateQuestionsFromDocuments } from "./question_bank_generator.js";
import { QuestionTypeZodEnum, DifficultyZodEnum } from "../generation_agents/Types/inputExam.js";

const accessOf = (req: Request): QuestionBankAccess => ({ userId: req.user!.id, role: req.user!.role });

function assertCanAccessDocument(document: { createdBy: string }, req: Request) {
    if (!canAccessDocument(document, accessOf(req))) {
        // 404, not 403 — a document the caller can't reach shouldn't be
        // confirmed to exist.
        throw ApiError.notFound("Document not found");
    }
}

/** Rename/delete: the uploader, or an admin acting on their behalf. */
function assertOwnsDocument(document: { createdBy: string }, req: Request) {
    if (document.createdBy !== req.user!.id && req.user!.role !== "admin") {
        throw ApiError.forbidden("Not your document");
    }
}

export const uploadDocumentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!req.file) throw ApiError.badRequest("A PDF file is required (field name: file)");
        if (req.file.mimetype !== "application/pdf") throw ApiError.badRequest("Only PDF files are supported");

        const uploaded = await uploadRawToCloudinary(req.file.buffer, "question-bank/documents");
        const title = typeof req.body?.title === "string" && req.body.title.trim() ? req.body.title.trim() : req.file.originalname;

        const document = await createDocument({
            title,
            fileUrl: uploaded.url,
            createdBy: req.user!.id,
        });

        try {
            await inngest.send({ name: "question-bank/document.process", data: { documentId: document.id } });
        } catch (sendError) {
            throw ApiError.internal("Could not reach the background job service (Inngest) — is it running?");
        }

        console.log(`[question-bank] uploaded "${title}" as document ${document.id}, processing started`);
        res.status(202).json({ success: true, data: { documentId: document.id, status: document.status } });
    } catch (err) {
        next(err);
    }
};

export const listDocumentsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const documents = await listAccessibleDocuments(accessOf(req));
        res.json({ success: true, data: documents });
    } catch (err) {
        next(err);
    }
};

export const getDocumentStatusHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const document = await getDocument(String(req.params.documentId));
        if (!document) throw ApiError.notFound("Document not found");
        assertCanAccessDocument(document, req);
        res.json({ success: true, data: document });
    } catch (err) {
        next(err);
    }
};

const RenameDocumentRequestZodSchema = z.object({
    title: z.string().trim().min(1).max(200),
});

export const renameDocumentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const document = await getDocument(String(req.params.documentId));
        if (!document) throw ApiError.notFound("Document not found");
        assertOwnsDocument(document, req);

        const parsed = RenameDocumentRequestZodSchema.safeParse(req.body);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw ApiError.badRequest(`Invalid request body: ${issues}`);
        }

        const updated = await renameDocument(document.id, parsed.data.title);
        res.json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
};

export const deleteDocumentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const document = await getDocument(String(req.params.documentId));
        if (!document) throw ApiError.notFound("Document not found");
        assertOwnsDocument(document, req);

        const chunks = await getChunksByDocument(document.id);

        await deleteQuestionBankPointsByDocument(document.id).catch((err) =>
            console.warn(`[question-bank] failed to delete Qdrant points for ${document.id}:`, err?.message)
        );

        await deleteFromCloudinaryByUrl(document.fileUrl);
        await Promise.all(
            chunks.flatMap((chunk) => (chunk.images ?? []).map((img) => deleteFromCloudinaryByUrl(img.url)))
        );

        await deleteDocument(document.id);

        console.log(`[question-bank] deleted document ${document.id} ("${document.title}") and ${chunks.length} chunk(s)`);
        res.json({ success: true, data: { documentId: document.id } });
    } catch (err) {
        next(err);
    }
};

async function assertDocumentsReady(documentIds: string[], req: Request) {
    const documents = await getDocumentsByIds(documentIds);
    if (documents.length !== documentIds.length) throw ApiError.notFound("One or more documents were not found");
    for (const document of documents) assertCanAccessDocument(document, req);
    const notReady = documents.find((d) => d.status !== "completed");
    if (notReady) throw ApiError.badRequest(`Document "${notReady.title}" is still processing`);
}

const GenerateFromDocumentsRequestZodSchema = z.object({
    documentIds: z.array(z.string()).min(1),
    topics: z.object({
        high: z.array(z.string()).default([]),
        mid: z.array(z.string()).default([]),
        low: z.array(z.string()).default([]),
    }),
    difficulty: DifficultyZodEnum,
    questionCount: z.number().int().min(1).max(50),
    questionType: QuestionTypeZodEnum,
    marks: z.number().positive(),
});

export const generateFromDocumentsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = GenerateFromDocumentsRequestZodSchema.safeParse(req.body);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw ApiError.badRequest(`Invalid request body: ${issues}`);
        }

        await assertDocumentsReady(parsed.data.documentIds, req);
        const groups = await generateQuestionsFromDocuments(parsed.data, accessOf(req));
        res.json({ success: true, data: { groups } });
    } catch (err) {
        next(err);
    }
};

const SearchRequestZodSchema = z.object({
    query: z.string().min(1),
    subject: z.string().optional(),
    topics: z.array(z.string()).optional(),
    limit: z.number().min(1).max(50).optional(),
});

export const searchQuestionBankHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = SearchRequestZodSchema.safeParse(req.body);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw ApiError.badRequest(`Invalid request body: ${issues}`);
        }

        const results = await searchQuestionBank(parsed.data.query, accessOf(req), {
            ...(parsed.data.subject !== undefined ? { subject: parsed.data.subject } : {}),
            ...(parsed.data.topics !== undefined ? { topics: parsed.data.topics } : {}),
            ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
        });

        res.json({ success: true, data: results });
    } catch (err) {
        next(err);
    }
};
