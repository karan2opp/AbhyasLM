import { zodResponseFormat } from "openai/helpers/zod";
import { ConversationSummaryZodSchema } from "../Types/outputConversation.js";
import { tools as reviewChatTools } from "../agents/blueprint_review_agent.js";
import { tools as questionReviewChatTools } from "../agents/question_review_agent.js";

export interface RealtimeToolDef {
    type: "function";
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

// Realtime tool definitions are a FLAT {type, name, description, parameters}
// shape — unlike Chat Completions tools, which nest name/parameters/description
// under a "function" key. Both are generated from the same Zod schemas via the
// OpenAI SDK's own zod-to-json-schema conversion, so neither agent's JSON
// contract (or the deterministic code that consumes it) has to be duplicated
// for voice — this just reshapes the existing Chat Completions tool object.
function chatToolToRealtime(chatTool: any): RealtimeToolDef {
    return {
        type: "function",
        name: chatTool.function.name,
        description: chatTool.function.description || "",
        parameters: chatTool.function.parameters,
    };
}

// The Exam Intent Agent has no tools in its text form (it ends a turn with
// response_format JSON instead) — for voice it gets exactly one tool, built
// from the same ConversationSummaryZodSchema the text flow already parses
// its JSON into, so the two flows produce an identical summary shape.
export function getIntentAgentRealtimeTools(): RealtimeToolDef[] {
    const rf = zodResponseFormat(ConversationSummaryZodSchema, "exam_intent_summary") as any;
    return [
        {
            type: "function",
            name: "save_exam_intent_summary",
            description:
                "Call this once — and only once — you have gathered enough information about the exam " +
                "(question style, topic emphasis, sample questions, additional preferences). Provide the " +
                "final structured summary exactly as discussed with the teacher.",
            parameters: rf.json_schema.schema,
        },
    ];
}

// The Blueprint Review Agent is already fully tool-based — reuse its exact
// tool set (including finish_review), just reshaped for Realtime.
export function getReviewAgentRealtimeTools(): RealtimeToolDef[] {
    return reviewChatTools.map(chatToolToRealtime);
}

// Same for the Question Review Agent — its 1-3 generation cap lives in the
// zod schema (GenerateQuestionsArgsZodSchema), so it's enforced identically
// here without any extra code.
export function getQuestionReviewAgentRealtimeTools(): RealtimeToolDef[] {
    return questionReviewChatTools.map(chatToolToRealtime);
}
