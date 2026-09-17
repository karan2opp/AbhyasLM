import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import db from "../db/index.js";
import { users } from "../../module/users/user.schema.js";

declare global {
    namespace Express {
        interface Request {
            user?: { id: string };
        }
    }
}

// Placeholder until Clerk is wired in (deliberately deferred — see project
// plan). Reads a caller-supplied user id and JIT-provisions a local `users`
// row for it, the same shape Clerk gives us: `getAuth(req).userId`, upserted
// via a Clerk webhook or on first request. The two lines marked below are
// the ONLY things that change when Clerk goes in — nothing downstream of
// `req.user.id` needs to move.
const DEV_USER_ID = "dev-user";

export const requireAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = (req.headers["x-user-id"] as string) || DEV_USER_ID; // <- swap for Clerk's getAuth(req).userId

        let [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user) {
            [user] = await db.insert(users).values({ id: userId }).returning(); // <- swap for a Clerk-webhook-driven upsert
        }

        req.user = { id: user!.id };
        next();
    } catch (error) {
        next(error);
    }
};
