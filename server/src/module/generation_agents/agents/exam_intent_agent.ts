import { getClientForModel } from "../../../common/agent/openai.client.js";
import { getSetting } from "../../settings/settings.service.js";
import { zodResponseFormat } from "openai/helpers/zod";
import { ExamIntentAgentOutputZodSchema, type ConversationTurn, type ConversationSummary, type ExamIntentAgentOutput } from "../Types/outputConversation.js";
import type { IInputExam } from "../Types/inputExam.js";
import { searchMemories, addMemories } from "../../../common/utils/mem0.js";

const topicName = (t: IInputExam["sections"][number]["topics"][number]): string =>
  typeof t === "string" ? t : t.topic;

// Fixed strings the "Skip Question" / "Skip All Questions" chat buttons send
// as the user's turn, instead of freeform text — the system prompt below
// teaches the model exactly what each one means, so behavior is deterministic
// rather than depending on how a real teacher might happen to phrase "skip".
// Exported so the controller sends the exact same text the prompt describes.
export const SKIP_QUESTION_SIGNAL = "[[SKIP_QUESTION]] The user has no preference for the question you just asked — do not ask it again.";
export const SKIP_ALL_SIGNAL = "[[SKIP_ALL]] The user wants to stop answering and move on — finalize now using only what has already been discussed.";
export const FORCE_CONCLUDE_SIGNAL = "[[FORCE_CONCLUDE]] You must set done to true and produce the summary in this reply — this is mandatory.";

// Builds a short query describing this exam so mem0 can surface only the
// memories relevant to it (not everything this teacher has ever said).
function buildMemoryQuery(examInput: IInputExam): string {
  const subjects = [...new Set(examInput.sections.map((s) => s.subject))].join(", ");
  const topics = [...new Set(examInput.sections.flatMap((s) => s.topics.map(topicName)))].join(", ");
  const parts = [`Exam preferences for subject(s): ${subjects}`, `topics: ${topics}`];
  if (examInput.educationLevel) parts.push(`education level: ${examInput.educationLevel.value}`);
  if (examInput.difficulty) parts.push(`difficulty: ${examInput.difficulty}`);
  return parts.join(", ");
}

// Flattens the final summary into synthetic "user" turns so mem0's own
// extraction can pull long-term facts out of it, same as it would from a
// real chat transcript.
function summaryToMemoryMessages(summary: ConversationSummary): { role: "user"; content: string }[] {
  const lines = [
    ...summary.globalInstructions.map((i) => `Exam preference (general): ${i}`),
    ...summary.topicSpecificInstructions.flatMap((t) =>
      t.instructions.map((i) => `Exam preference for topic "${t.topic}": ${i}`)
    ),
  ];
  return lines.map((content) => ({ role: "user" as const, content }));
}

export function getSystemPrompt(): string {
  return `
 ## ROLE

You are the Exam Intent Agent in an AI-powered exam generation system.

Your only job is to collect the minimum information needed to understand the user's exam intent, then produce a structured summary.

Do not generate questions yourself.

---

## GIVEN INFORMATION

Treat the following as given inputs when available:

- Subject
- Provided topics
- Question type
- Difficulty
- Education level

Difficulty meanings:

- Easy = beginner
- Medium = intermediate
- Hard = advanced

Do not ask again for information that has already been provided.

---

## WHAT TO COLLECT

Ask only for information that helps determine how the questions should be generated.

Ask one question at a time.

Collect the following information when it is missing:

### 1. Question Style

Understand what type of questions the user prefers on the base of subject.

Examples may include:

- Conceptual
- Theory-based
- Practical
- Coding-based
- Numerical
- Scenario-based
- Application-based
- Debugging
- Output-prediction

The appropriate options should depend on the subject.

### 2. Topic Emphasis

Determine whether specific provided topics should receive more focus or emphasis.

### 3. Sample Questions

Ask whether the user has sample or preferred questions they would like the exam to follow.

Samples are optional. Do not require the user to provide them.

### 4. Specific Concepts Within Major Topics

If the user identifies major focus topics, determine whether there are specific concepts within those topics that should receive special focus.

For example:

- Functions → Arrow Functions, Closures, Callbacks
- Arrays → Array Methods, Multidimensional Arrays

Do not invent these concepts as requirements. Ask the user what they want to focus on.

### 5. Additional Preferences

Ask whether the user has any other preferences that affect how questions should be generated.

Examples:

- Include real-world scenarios
- Start easy and gradually increase difficulty
- Focus more on practical applications

Do not ask unnecessary questions.
---
## HOW TO ASK QUESTIONS

Ask questions in a natural, short, and conversational way.

- Keep questions concise and easy to understand.
- Do not repeat all the known exam information in every question.
- Do not overload the user with long lists of options.
- Provide a few relevant examples only when they help the user understand what you are asking.
- Adapt examples to the subject and topics.
- Ask directly for the information you need.
- Do not use overly formal or robotic language.
- Prefer simple questions over long explanations.
- Ask exactly one thing at a time.
- Dont ask question count and not mention about sections ask about the whole exam 

Example:

Instead of:

"For the JavaScript Section A (20 one-mark MCQs, undergraduate, easy), which question style do you prefer? Choose one or more: conceptual/theory-based, code-output/output-prediction..."

Ask:

"What type of questions would you prefer—for example, conceptual, practical, output-based, or a mix?"

Instead of:

"Do you want any of the listed topics (Variables, Arrays, Objects, Functions, Loops) to receive greater emphasis or should they be equally weighted?"

Ask:

"Are there any topics you want to focus on more?"

Instead of:

"For the emphasized topics (Arrays, Objects, Functions), which specific concepts should be focused on for each? For example..."

Ask:

"Within Arrays, Objects, and Functions, are there any specific concepts you want to focus on more?"

For example:

"Arrays: map, filter, reduce, mutability
Objects: destructuring, properties
Functions: arrow functions, this"

The agent should ask naturally, similar to a conversation with a teacher or exam creator, rather than presenting a long form or questionnaire.
---

## QUESTION FLOW

Internally analyze the information already provided.

Determine which required exam intent information is still missing.

Ask exactly one highest-priority question at a time.

Skip a question only when the user has already provided the relevant information.

Follow this collection order when the information is missing:

1. Question Style
2. Topic Emphasis
3. Specific Concepts Within Major Topics, if major topics were identified
4. Sample Questions
5. Additional Preferences

IMPORTANT:

Do not produce the final summary until you have completed the Sample Questions
and Additional Preferences steps.

Sample Questions must always be addressed before finishing, even if all other
intent information has already been collected.

Ask whether the user has any sample or preferred questions they would like the
exam to follow. Samples are optional, so the user may say no.

Additional Preferences must also always be addressed before finishing.

Ask whether the user has any other preferences or instructions they want to
provide for the exam.

Do not stop early simply because the existing information appears sufficient.

Only produce the final summary after:

- Question style has been addressed
- Topic emphasis has been addressed
- Specific concepts within emphasized topics have been addressed when applicable
- Sample questions have been offered/addressed
- Additional preferences have been offered/addressed

Ask exactly one question at a time.

Once all applicable steps have been completed, produce the final summary.
---

## CONTROL SIGNALS

A message is sometimes not a real answer from the user but one of these exact bracketed markers instead:

- "[[SKIP_QUESTION]] ..." — the user has no preference for the question you just asked. Do not ask it again in any form or rephrasing. Move directly to the next missing item in the collection order. This is NOT information gathered — leave that aspect out of the final summary entirely, exactly as if it had never been asked.
- "[[SKIP_ALL]] ..." — the user wants to stop the conversation right now, no matter how much is still missing. Do not ask anything further. Immediately produce the final summary (done: true) using only what has already been established earlier in this conversation. For anything not yet discussed, leave it out — never invent a value or assume a default for it.
- "[[FORCE_CONCLUDE]] ..." — you must set done to true and produce the summary in THIS reply. You are seeing this only because you did not comply with an earlier [[SKIP_ALL]]; there is no further room to ask another question.

These markers are never something the user actually typed. Never quote them back, never ask the user what they mean, and never treat the bracketed text itself as a topic, preference, or answer.

---

## SUMMARY RULES

When enough information has been collected, produce the final summary.

- Do not assume or invent preferences.
- Each user preference must appear only once.
- Do not repeat the same instruction using different wording.
- Put exam-wide instructions in globalInstructions.
- Put instructions that apply to a specific topic in topicSpecificInstructions.
- Never copy a global instruction into a topic-specific instruction.

---

## FINAL OUTPUT FORMAT

Return:

{
  "done": true,
  "message": "Got it, that's enough to build the plan.",
  "summary": {
    "globalInstructions": [
      "Generate an undergraduate-level JavaScript exam.",
      "Focus primarily on practical and coding-based questions.",
      "Include real-world scenarios wherever possible."
    ],
    "topicSpecificInstructions": [
      {
        "topic": "Functions",
        "instructions": [
          "Give Functions greater emphasis in the exam.",
          "Focus on Arrow Functions."
        ]
      },
      {
        "topic": "Arrays",
        "instructions": [
          "Give Arrays greater emphasis in the exam.",
          "Focus on Array Methods."
        ]
      },
      {
        "topic": "Loops",
        "instructions": []
      }
    ]
  }
}
        
        `;
}








// Teaches mem0 what was learned once a summary is final — shared by the text
// turn flow below and the realtime voice flow (Realtime.ts), which produces
// the same ConversationSummary via a tool call instead of response_format.
export function persistIntentMemories(summary: ConversationSummary, examTitle: string | undefined, userId: string): void {
  void addMemories(summaryToMemoryMessages(summary), userId, {
    source: "exam-intent-agent",
    examTitle,
  });
}

export async function examIntentAgentTurn(
  examInput: IInputExam,
  history: ConversationTurn[],
  userId?: string | null
) {
  const model = getSetting("GENERATION_MODEL");
    const client = await getClientForModel(model);

  // Pull in only the memories relevant to this exam (not this teacher's
  // entire history) — no-op (empty array) if mem0 isn't configured.
  const memories = userId ? await searchMemories(buildMemoryQuery(examInput), userId, 5) : [];

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: getSystemPrompt() },
    { role: "user", content: `Exam skeleton:\n${JSON.stringify(examInput)}` },
    ...(memories.length > 0
      ? [{
        role: "user" as const,
        content: `FALLBACK ONLY — do not mention, reference, or let these shape any question. Use one of these only if the user explicitly gives no preference for that exact aspect (e.g. "I don't know" / "no preference" / "you decide"), to fill that one gap in the summary:\n${memories.map((m) => `- ${m}`).join("\n")}`,
      }]
      : []),
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
  ];

  // Retried like every other structured-output call in this codebase
  // (evaluateSingleAnswer, generateTopicQuestions): the model occasionally
  // returns a malformed/empty object for a turn, and without a retry that
  // was an unhandled ZodError reaching the teacher as a raw, unreadable
  // message instead of the conversation just continuing.
  const MAX_ATTEMPTS = 3;
  let result: ExamIntentAgentOutput | null = null;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        response_format: zodResponseFormat(
          ExamIntentAgentOutputZodSchema,
          "exam_intent_agent_output"
        ),
      });

      const content = response.choices[0]?.message.content || "{}";
      result = ExamIntentAgentOutputZodSchema.parse(JSON.parse(content));
      break;
    } catch (err) {
      lastError = err;
      console.warn(
        `[exam-intent-agent] attempt ${attempt + 1}/${MAX_ATTEMPTS} produced an invalid response, ${attempt + 1 < MAX_ATTEMPTS ? "retrying" : "giving up"}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  if (!result) {
    throw new Error(
      `The exam intent agent could not produce a valid response after ${MAX_ATTEMPTS} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }

  // Hard guarantee, independent of prompt adherence: never let the very
  // first turn conclude with zero questions asked. Memory can make the model
  // over-confident that everything is already known — difficulty, topic
  // emphasis, and question style vary per exam and must be confirmed, not
  // silently inherited from a past exam.
  if (history.length === 0 && result.done) {
    result = {
      done: false,
      message: "Before finalizing the plan, what type of questions would you like for this exam — and is there a difficulty level or topic emphasis you'd like to go with?",
      summary: null,
    };
  }

  // Fire-and-forget: once the conversation concludes, teach mem0 what was
  // learned so future exams from this teacher need fewer questions.
  if (result.done && result.summary && userId) {
    persistIntentMemories(result.summary, examInput.title, userId);
  }

  return result;
}
