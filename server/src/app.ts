import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { serve } from "inngest/express";
import { inngest } from "./common/inngest/client.js";
import { questionBankFunctions } from "./module/question_bank/inngest/functions.js";
import questionBankRouter from "./module/question_bank/question_bank.route.js";
import userRouter from "./module/users/user.route.js";
import examRouter from "./module/exams/exam.route.js";
import { examFunctions } from "./module/exams/inngest/functions.js";
import { bookFunctions } from "./module/books/inngest/functions.js";
import bookRouter from "./module/books/book.route.js";
import { generationAgentFunctions } from "./module/generation_agents/inngest/functions.js";
import generationAgentsRouter from "./module/generation_agents/generation_agents.route.js";
import evaluationRouter from "./module/evaluation/evaluation.route.js";
import settingsRouter from "./module/settings/settings.route.js";
import errorHandler from "./common/middleware/error.middleware.js";
import "dotenv/config";

const app = express();

// A comma-separated list, not just one URL — lets both the deployed frontend
// and localhost work against this same server at once (handy for testing
// against a real deployment without redeploying every time), and covers a
// custom domain added later alongside the platform's default one. Both CORS
// and Clerk below key off this same list, so nothing can accept one without
// the other.
const frontendUrls = (process.env.FRONTEND_URL || "http://localhost:3000")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

app.use(cors({
    origin: frontendUrls,
    credentials: true,
}));

// Inngest sends the results of every completed step with each call, so a long job (a whole book) quickly
// outgrows the 100 KB default body limit. Registered before the global parser so this limit applies.
app.use("/api/inngest", express.json({ limit: "50mb" }), serve({ client: inngest, functions: [...questionBankFunctions, ...bookFunctions, ...generationAgentFunctions, ...examFunctions] }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Reads and verifies the Clerk session on every request below; routes opt in
// to requiring one with requireAuth. Kept after /api/inngest, which Inngest
// authenticates with its own signing key.
app.use(clerkMiddleware({ authorizedParties: frontendUrls }));

app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

app.use("/api", userRouter);
app.use("/api", examRouter);
app.use("/api", settingsRouter);
app.use("/api/question-bank", questionBankRouter);
app.use("/api/books", bookRouter);
app.use("/api/generation-agents", generationAgentsRouter);
app.use("/api/evaluation", evaluationRouter);

app.use(errorHandler);

export default app;
