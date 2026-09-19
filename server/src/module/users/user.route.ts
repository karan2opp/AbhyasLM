import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import db from "../../common/db/index.js";
import { requireAuth, requireRole } from "../../common/middleware/auth.middleware.js";
import { ApiError } from "../../common/utils/ApiError.js";
import { encrypt } from "../../common/utils/crypto.js";
import { users, userRoles } from "./user.schema.js";

const me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        res.json({ success: true, data: req.user });
    } catch (error) {
        next(error);
    }
};

// Picked right after signing up, and freely switchable afterwards — this is
// the same endpoint both times. Admin is deliberately not selectable here —
// it comes from ADMIN_EMAILS or from another admin (see setUserRole below) —
// and an admin can't demote themselves through this endpoint either, so
// nobody can promote themselves and an admin can't lock themselves out.
const ChooseRoleZodSchema = z.object({ role: z.enum(["examiner", "candidate"]) });

const chooseRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = ChooseRoleZodSchema.safeParse(req.body);
        if (!parsed.success) throw ApiError.badRequest("Choose either examiner or candidate");
        if (req.user!.role === "admin") throw ApiError.forbidden("Admins can't change their own role here — ask another admin");

        const [updated] = await db.update(users).set({ role: parsed.data.role }).where(eq(users.id, req.user!.id)).returning();
        res.json({ success: true, data: { id: updated!.id, email: updated!.email, role: updated!.role } });
    } catch (error) {
        next(error);
    }
};

const SetOpenAiKeyZodSchema = z.object({ apiKey: z.string().trim().min(20, "That doesn't look like a valid OpenAI key") });

// Lets an examiner use their own OpenAI billing for generation/grading
// instead of the platform's shared key. Stored encrypted (see crypto.ts);
// the raw key is never read back — only whether one is set (see `me` below).
const setOpenAiKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = SetOpenAiKeyZodSchema.safeParse(req.body);
        if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message || "A valid OpenAI API key is required");
        if (!parsed.data.apiKey.startsWith("sk-")) throw ApiError.badRequest('OpenAI keys start with "sk-"');

        await db.update(users).set({ openaiApiKeyEncrypted: encrypt(parsed.data.apiKey) }).where(eq(users.id, req.user!.id));
        res.json({ success: true, data: { hasOwnOpenAiKey: true } });
    } catch (error) {
        next(error);
    }
};

const deleteOpenAiKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await db.update(users).set({ openaiApiKeyEncrypted: null }).where(eq(users.id, req.user!.id));
        res.json({ success: true, data: { hasOwnOpenAiKey: false } });
    } catch (error) {
        next(error);
    }
};

const listUsers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const rows = await db
            .select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt })
            .from(users)
            .orderBy(desc(users.createdAt));
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
};

const SetRoleZodSchema = z.object({ role: z.enum(userRoles) });

const setUserRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const parsed = SetRoleZodSchema.safeParse(req.body);
        if (!parsed.success) throw ApiError.badRequest(`role must be one of: ${userRoles.join(", ")}`);

        const userId = String(req.params.userId);
        // An admin removing their own admin rights could leave nobody able to
        // manage roles, so that has to go through another admin.
        if (userId === req.user!.id && parsed.data.role !== "admin") {
            throw ApiError.badRequest("You can't change your own admin role — ask another admin");
        }

        const [updated] = await db.update(users).set({ role: parsed.data.role }).where(eq(users.id, userId)).returning();
        if (!updated) throw ApiError.notFound("User not found");
        res.json({ success: true, data: { id: updated.id, email: updated.email, name: updated.name, role: updated.role } });
    } catch (error) {
        next(error);
    }
};

const router = Router();

router.get("/me", requireAuth, me);
router.post("/me/role", requireAuth, chooseRole);
router.post("/me/openai-key", requireAuth, setOpenAiKey);
router.delete("/me/openai-key", requireAuth, deleteOpenAiKey);
router.get("/admin/users", requireAuth, requireRole("admin"), listUsers);
router.patch("/admin/users/:userId/role", requireAuth, requireRole("admin"), setUserRole);

export default router;
