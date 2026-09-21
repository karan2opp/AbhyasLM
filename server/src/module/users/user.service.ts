import { eq } from "drizzle-orm";
import db from "../../common/db/index.js";
import { decrypt } from "../../common/utils/crypto.js";
import { users } from "./user.schema.js";

/**
 * Resolves an owner's own OpenAI key for background (Inngest) jobs, which
 * run outside the original request and so can't rely on request_context.ts
 * being populated already — each job loads its owning user explicitly and
 * wraps its work in runWithUserOpenAiKey itself. Falls back to the platform
 * key (returns undefined) on any lookup/decrypt failure.
 */
export async function resolveUserOpenAiKey(userId: string): Promise<string | undefined> {
    const [user] = await db.select({ openaiApiKeyEncrypted: users.openaiApiKeyEncrypted }).from(users).where(eq(users.id, userId));
    if (!user?.openaiApiKeyEncrypted) {
        console.log(`[resolveUserOpenAiKey] user ${userId} has no stored key — falling back to the platform key`);
        return undefined;
    }
    try {
        return decrypt(user.openaiApiKeyEncrypted);
    } catch (err) {
        console.error(`[resolveUserOpenAiKey] failed to decrypt stored key for user ${userId} — falling back to the platform key`, err);
        return undefined;
    }
}
