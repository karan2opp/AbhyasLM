import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// A flat key/value override store. Every key also has a hard-coded default
// (see settings.service.ts) — a row here only exists once an admin has
// changed that setting away from its default.
export const platformSettings = pgTable("platform_settings", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PlatformSetting = typeof platformSettings.$inferSelect;
