import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = { userOpenAiKey: string | undefined };

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Makes a signed-in user's own OpenAI key available to every downstream call
 * in this request (or Inngest step) without threading it through every
 * function signature between here and openai.client.ts. Falls back to the
 * platform's shared key when nobody set one — see getOpenAI().
 */
export function runWithUserOpenAiKey<T>(userOpenAiKey: string | undefined, fn: () => T): T {
    return storage.run({ userOpenAiKey }, fn);
}

export function getUserOpenAiKey(): string | undefined {
    return storage.getStore()?.userOpenAiKey;
}
