import dotenv from "dotenv";
import { getUserOpenAiKey } from "../utils/request_context.js";

dotenv.config();

let openaiClient: any = null;
let mistralClient: any = null;

const getOpenAI = async () => {
    // A signed-in examiner's own key, if they've set one — see
    // request_context.ts. Never cached module-wide since it's per-user.
    const userKey = getUserOpenAiKey();
    if (userKey) {
        const openai = (await import("openai")).default;
        return new openai.OpenAI({ apiKey: userKey });
    }

    if (openaiClient) return openaiClient;
    const API_KEY = process.env.OPENAI_API_KEY;
    if (!API_KEY) {
        throw new Error("OPENAI_API_KEY is not set in the environment variables.");
    }
    const openai = (await import("openai")).default;
    openaiClient = new openai.OpenAI({ apiKey: API_KEY });
    return openaiClient;
};

const getMistral = async () => {
    if (mistralClient) return mistralClient;
    const API_KEY = process.env.MISTRAL_API_KEY;
    if (!API_KEY) {
        throw new Error("MISTRAL_API_KEY is not set in the environment variables.");
    }
    const openai = (await import("openai")).default;
    mistralClient = new openai.OpenAI({
        apiKey: API_KEY,
        baseURL: "https://api.mistral.ai/v1",
    });
    return mistralClient;
};

export const getClientForModel = async (model: string) => {
    const name = model.toLowerCase();
    // "ministral" (Mistral's small-model family, e.g. ministral-14b-2512)
    // does NOT contain "mistral" as a substring — check both explicitly.
    if (name.includes("mistral") || name.includes("ministral")) {
        return getMistral();
    }
    return getOpenAI();
};
