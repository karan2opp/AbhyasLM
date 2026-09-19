import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import { ApiError } from "../../common/utils/ApiError.js";
import { QuestionContentBlockZodSchema } from "../generation_agents/Types/outputGeneration.js";
import { evaluateAnswer } from "./evaluation.js";

// In Abhyas grading ran inside exam submission; here it is called directly
// with the question, its rubric and the answer to grade.
const EvaluateRequestZodSchema = z.object({
    question: z.string().min(1),
    studentAnswer: z.string(),
    maxMarks: z.number().positive(),
    modelAnswer: z.string().optional(),
    contentBlocks: z.array(QuestionContentBlockZodSchema).optional(),
    questionImages: z.array(z.object({ url: z.string().url(), publicId: z.string() })).optional(),
    rubric: z
        .object({
            categories: z.array(z.object({ name: z.string(), weight: z.number(), key_points: z.array(z.string()) })).min(1),
        })
        .nullable()
        .optional(),
});

const evaluateHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = EvaluateRequestZodSchema.safeParse(req.body);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            throw ApiError.badRequest(`Invalid request body: ${issues}`);
        }
        res.status(200).json({ success: true, data: await evaluateAnswer(parsed.data) });
    } catch (error) {
        next(error);
    }
};

const router = Router();

router.post("/", requireAuth, evaluateHandler);

export default router;
