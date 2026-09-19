import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/middleware/auth.middleware.js";
import { ApiError } from "../../common/utils/ApiError.js";
import { listSettings, updateSettings } from "./settings.service.js";

const listHandler = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        res.json({ success: true, data: await listSettings() });
    } catch (error) {
        next(error);
    }
};

const UpdateSettingsZodSchema = z.object({ settings: z.record(z.string(), z.string()) });

const updateHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = UpdateSettingsZodSchema.safeParse(req.body);
        if (!parsed.success) throw ApiError.badRequest("Invalid request body");
        await updateSettings(parsed.data.settings);
        console.log(`[settings] updated: ${Object.keys(parsed.data.settings).join(", ")}`);
        res.json({ success: true, data: await listSettings() });
    } catch (error) {
        next(error instanceof Error && !(error instanceof ApiError) ? ApiError.badRequest(error.message) : error);
    }
};

const router = Router();

router.get("/admin/settings", requireAuth, requireRole("admin"), listHandler);
router.patch("/admin/settings", requireAuth, requireRole("admin"), updateHandler);

export default router;
