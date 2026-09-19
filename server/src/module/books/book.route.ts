import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { requireExaminer } from "../../common/middleware/auth.middleware.js";
import { getSetting } from "../settings/settings.service.js";
import {
    uploadBookHandler,
    listBooksHandler,
    getBookHandler,
    getSubsectionContentHandler,
    deleteBookHandler,
} from "./book.controller.js";

// Built fresh per request so an admin's upload-limit change (see the
// settings page) applies immediately, without restarting the server.
const bookUpload = (req: Request, res: Response, next: NextFunction) =>
    multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: Number(getSetting("BOOK_MAX_MB")) * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (file.mimetype === "application/pdf") cb(null, true);
            else cb(new Error("Only PDF files are allowed"));
        },
    }).single("file")(req, res, next);

const router = Router();

router.post("/", requireExaminer, bookUpload, uploadBookHandler);
router.get("/", requireExaminer, listBooksHandler);
router.get("/:bookId", requireExaminer, getBookHandler);
router.get("/:bookId/subsections/:nodeId", requireExaminer, getSubsectionContentHandler);
router.delete("/:bookId", requireExaminer, deleteBookHandler);

export default router;
