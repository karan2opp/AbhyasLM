import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Deliberately minimal — no role, no organisationId. Every other table in
// this project owns its rows by this id directly; there is no tenancy
// concept above "a user." `id` will be a Clerk user id once auth.middleware
// is wired to real Clerk; until then it's whatever requireAuth resolves.
export const users = pgTable("users", {
    id: text("id").primaryKey(),
    email: text("email"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
