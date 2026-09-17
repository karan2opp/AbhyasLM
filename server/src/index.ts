import http from "http";
import app from "./app.js";
import { env } from "./env.js";

const start = () => {
    const server = http.createServer(app);
    server.listen(env.PORT, () => {
        console.log(`Server started on port ${env.PORT}`);
    });
};

start();
