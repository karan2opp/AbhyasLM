import type { Request, Response, NextFunction } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import db from "../db/index.js";
import { users, type UserRole } from "../../module/users/user.schema.js";
import { ApiError } from "../utils/ApiError.js";

declare global {
    namespace Express {
        interface Request {
            // `role` is null until the user picks one right after signing up.
            user?: { id: string; email: string | null; role: UserRole | null };
        }
    }
}

// Emails listed in ADMIN_EMAILS become admins the first time they sign in, so
// a fresh deployment has someone who can hand out roles.
const adminEmails = (): string[] =>
    (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

type UserRow = typeof users.$inferSelect;

async function loadOrCreateUser(userId: string): Promise<UserRow> {
    const [existing] = await db.select().from(users).where(eq(users.id, userId));
    if (existing) {
        // Someone who signed in before being listed in ADMIN_EMAILS, and hasn't picked a role yet.
        if (!existing.role && existing.email && adminEmails().includes(existing.email.toLowerCase())) {
            const [promoted] = await db.update(users).set({ role: "admin" }).where(eq(users.id, userId)).returning();
            return promoted!;
        }
        return existing;
    }

    // First request from this Clerk user: create their row.
    const clerkUser = await clerkClient.users.getUser(userId);
    const email = clerkUser.primaryEmailAddress?.emailAddress ?? null;
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;
    const role: UserRole | null = email && adminEmails().includes(email.toLowerCase()) ? "admin" : null;

    await db.insert(users).values({ id: userId, email, name, role }).onConflictDoNothing();
    const [created] = await db.select().from(users).where(eq(users.id, userId));
    if (!created) throw ApiError.internal("Could not create your user record");
    return created;
}

/**
 * Requires a signed-in Clerk user. `clerkMiddleware()` (mounted in app.ts)
 * verifies the session token from the `Authorization: Bearer` header or the
 * session cookie; this rejects requests without one and loads the user's row,
 * so `req.user.role` is available to the role guards below.
 */
export const requireAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
        const { userId } = getAuth(req);
        if (!userId) throw ApiError.unauthorized("Sign in required");

        const user = await loadOrCreateUser(userId);
        req.user = { id: user.id, email: user.email, role: user.role };
        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Restricts a route to the given roles. Always used after requireAuth, e.g.
 * `router.post("/", requireAuth, requireRole("examiner", "admin"), handler)`.
 * Someone who hasn't picked a role yet is told to pick one rather than being
 * refused outright, so the client can send them to the role screen.
 */
export const requireRole =
    (...roles: UserRole[]) =>
    (req: Request, _res: Response, next: NextFunction): void => {
        const role = req.user?.role ?? null;
        if (!role) return next(ApiError.forbidden("Choose a role before using this feature"));
        if (!roles.includes(role)) return next(ApiError.forbidden("Your role doesn't have access to this"));
        next();
    };

/** Examiner-level access: what an examiner can do, an admin can do too. */
export const requireExaminer = [requireAuth, requireRole("examiner", "admin")];
