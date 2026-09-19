// First, so .env is loaded before any module reads process.env at import time
// (the Inngest client decides dev vs cloud mode when it's created).
import "dotenv/config";
import http from "http";
import app from "./app.js";
import { env } from "./env.js";
import { initSettingsCache } from "./module/settings/settings.service.js";

const start = async () => {
    // Loads admin-overridden settings (models, upload limits) before the
    // server accepts requests, so the very first request already sees them.
    await initSettingsCache();

    const server = http.createServer(app);
    server.listen(env.PORT, () => {
        console.log(`Server started on port ${env.PORT}`);
    });
};

start();
