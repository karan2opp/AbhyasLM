import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  PORT: z.string().default("8000").transform((val) => parseInt(val, 10)),
  // Read directly by @clerk/express; validated here so a missing key fails at
  // startup instead of on the first signed-in request.
  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required (Clerk dashboard → API keys)"),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, "CLERK_PUBLISHABLE_KEY is required (Clerk dashboard → API keys)"),
  GENERATION_MODEL: z.string().default("mistral-small-latest"),
  EVALUATION_MODEL: z.string().default("mistral-small-latest"),
  GUARDRAIL_MODEL: z.string().default("mistral-small-latest"),
  REALTIME_MODEL: z.string().default("gpt-realtime"),
  REALTIME_VOICE: z.string().default("marin"),
  PDF_VISION_MODEL: z.string().default("gpt-4.1-mini"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  PYTHON_BIN: z.string().default("python3"),
});

function createEnv(env: NodeJS.ProcessEnv) {
  const safeParseResult = envSchema.safeParse(env);
  if (!safeParseResult.success) {
    const problems = safeParseResult.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${problems}`);
  }
  return safeParseResult.data;
}
export const env = createEnv(process.env);
