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
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
