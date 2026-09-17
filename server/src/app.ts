import express from "express";
import cors from "cors";
import { serve } from "inngest/express";
import { inngest } from "./common/inngest/client.js";
import { questionBankFunctions } from "./module/question_bank/inngest/functions.js";
import questionBankRouter from "./module/question_bank/question_bank.route.js";
import errorHandler from "./common/middleware/error.middleware.js";
import "dotenv/config";

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

app.use("/api/question-bank", questionBankRouter);
app.use("/api/inngest", serve({ client: inngest, functions: [...questionBankFunctions] }));

app.use(errorHandler);

export default app;
