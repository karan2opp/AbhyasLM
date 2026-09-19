import db from "../../common/db/index.js";
import { env } from "../../env.js";
import { platformSettings } from "./settings.schema.js";

export interface SettingDef {
    key: string;
    label: string;
    description: string;
    default: string;
}

// Every setting an admin can override, with the value this project ships
// with. Adding a new one here is the only step needed to make it editable —
// listSettings/updateSettings work off this list generically.
export const SETTINGS: SettingDef[] = [
    { key: "GENERATION_MODEL", label: "Generation model", description: "Writes exam questions, plans subtopics, and applies chat edits from the Refinement and Question Review agents.", default: env.GENERATION_MODEL },
    { key: "EVALUATION_MODEL", label: "Evaluation model", description: "Grades a candidate's written answer against its rubric.", default: env.EVALUATION_MODEL },
    { key: "GUARDRAIL_MODEL", label: "Guardrail model", description: "Screens a written answer for prompt injection before it's graded.", default: env.GUARDRAIL_MODEL },
    { key: "EMBEDDING_MODEL", label: "Embedding model", description: "Turns question-bank text into vectors for semantic search.", default: env.EMBEDDING_MODEL },
    { key: "REALTIME_MODEL", label: "Realtime voice model", description: "Powers the spoken exam-setup conversation, when voice is used.", default: env.REALTIME_MODEL },
    { key: "REALTIME_VOICE", label: "Realtime voice", description: "The voice used for spoken conversations.", default: env.REALTIME_VOICE },
    { key: "QUESTION_BANK_MAX_MB", label: "Past paper upload limit (MB)", description: "Largest PDF a past-paper upload will accept.", default: "30" },
    { key: "BOOK_MAX_MB", label: "Book upload limit (MB)", description: "Largest PDF a book upload will accept.", default: "150" },
];

const DEFAULTS = new Map(SETTINGS.map((s) => [s.key, s.default]));

// In-memory cache: every model call and file upload reads a setting
// synchronously (no DB round trip per question generated), so the cache is
// loaded once at startup and refreshed in place on every admin write.
let cache: Map<string, string> = new Map(DEFAULTS);

async function loadCache(): Promise<Map<string, string>> {
    const rows = await db.select().from(platformSettings);
    const next = new Map(DEFAULTS);
    for (const row of rows) if (DEFAULTS.has(row.key)) next.set(row.key, row.value);
    return next;
}

/** Called once at startup so the first request already has real overrides, not just defaults. */
export async function initSettingsCache(): Promise<void> {
    cache = await loadCache();
}

/** Synchronous — this is what every model-selection and upload-limit call site reads. */
export function getSetting(key: string): string {
    return cache.get(key) ?? DEFAULTS.get(key) ?? "";
}

export async function listSettings() {
    return SETTINGS.map((def) => ({ ...def, value: cache.get(def.key) ?? def.default }));
}

export async function updateSettings(patch: Record<string, string>): Promise<void> {
    const unknown = Object.keys(patch).filter((key) => !DEFAULTS.has(key));
    if (unknown.length > 0) throw new Error(`Unknown setting(s): ${unknown.join(", ")}`);

    for (const [key, value] of Object.entries(patch)) {
        await db
            .insert(platformSettings)
            .values({ key, value: value.trim(), updatedAt: new Date() })
            .onConflictDoUpdate({ target: platformSettings.key, set: { value: value.trim(), updatedAt: new Date() } });
    }
    cache = await loadCache();
}
