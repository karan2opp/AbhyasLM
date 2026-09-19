import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// admin     — manages users and roles, sees everyone's content, and can do
//             everything an examiner can.
// examiner  — creates exams, uploads papers and books, publishes exams.
// candidate — takes published exams and sees their own results.
// null      — signed up but hasn't picked a role yet (see /api/me/role).
export const userRoles = ["admin", "examiner", "candidate"] as const;
export type UserRole = (typeof userRoles)[number];

// `id` is the Clerk user id; the row is created on the user's first
// authenticated request (see auth.middleware.ts).
export const users = pgTable("users", {
    id: text("id").primaryKey(),
    email: text("email"),
    name: text("name"),
    role: text("role").$type<UserRole>(),
    // AES-256-GCM ciphertext (see common/utils/crypto.ts) of the examiner's
    // own OpenAI key, if they've set one — falls back to the platform's
    // shared key otherwise. Never sent to the client; only a boolean
    // presence flag is (see user.route.ts).
    openaiApiKeyEncrypted: text("openai_api_key_encrypted"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
