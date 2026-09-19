// Minimal mem0 client (REST) for the chatbot's long-term memory.
// Supports both the hosted platform (https://api.mem0.ai/v3) and a self-hosted
// OSS mem0 server (point MEM0_API_URL at it; the OSS server uses /memories and
// /search paths instead of /v3/memories/*). All calls degrade gracefully when
// no MEM0_API_KEY is configured or the service is unreachable.

export interface MemoMessage {
  role: "user" | "assistant";
  content: string;
}

const baseUrl = (): string => process.env.MEM0_API_URL || "https://api.mem0.ai/v3";
const apiKey = (): string => process.env.MEM0_API_KEY || "";

const enabled = (): boolean => Boolean(apiKey());
const isPlatform = (): boolean => baseUrl().includes("api.mem0.ai");

const addPath = (): string =>
  isPlatform() ? `${baseUrl()}/memories/add/` : `${baseUrl()}/memories`;

const searchPath = (): string =>
  isPlatform() ? `${baseUrl()}/memories/search/` : `${baseUrl()}/search`;

/**
 * Returns up to `limit` stored memories relevant to `query`, scoped to the user.
 * Empty array when mem0 is disabled or anything fails.
 */
export const searchMemories = async (
  query: string,
  userId: string,
  limit: number = 5
): Promise<string[]> => {
  if (!enabled() || !userId) return [];
  try {
    const body = isPlatform()
      ? { query, filters: { user_id: userId }, top_k: limit }
      : { query, user_id: userId };

    const res = await fetch(searchPath(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Token ${apiKey()}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[mem0] search failed: ${res.status} ${res.statusText}`);
      return [];
    }

    const data: any = await res.json();
    const results: any[] = data.results ?? [];
    return results
      .map((r) => (typeof r?.memory === "string" ? r.memory : ""))
      .filter(Boolean)
      .slice(0, limit);
  } catch (err) {
    console.warn("[mem0] search error:", err);
    return [];
  }
};

/**
 * Stores `messages` (conversation turns) for the user so mem0 can extract and
 * persist long-term memories. Fire-and-forget; failures are logged, not thrown.
 */
export const addMemories = async (
  messages: MemoMessage[],
  userId: string,
  metadata?: Record<string, unknown>
): Promise<void> => {
  if (!enabled() || !userId) return;
  try {
    const body: Record<string, unknown> = { messages, user_id: userId };
    if (metadata) body.metadata = metadata;

    const res = await fetch(addPath(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Token ${apiKey()}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[mem0] add failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.warn("[mem0] add error:", err);
  }
};