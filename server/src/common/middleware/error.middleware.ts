import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError.js";
import { ZodError } from "zod";
import fs from "fs";

const errorHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => {
    // already formatted ApiError
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
        });
    }

    // Zod validation error (fallback if validate middleware misses something)
    if (err instanceof ZodError) {
        return res.status(400).json({
            success: false,
            message: err.issues.map(e => e.message).join(", "),
        });
    }

    // JWT errors
    if (err instanceof Error) {
        if (err.name === "JsonWebTokenError") {
            return res.status(401).json({
                success: false,
                message: "Invalid token",
            });
        }
        if (err.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                message: "Token expired, please login again",
            });
        }
    }

    // unknown/unhandled errors
    console.error("Unhandled error:", err);
    try {
        fs.appendFileSync("error.log", new Date().toISOString() + " " + String(err instanceof Error ? err.stack : err) + "\n");
    } catch (e) {}
    
    return res.status(500).json({
        success: false,
        message: err instanceof Error ? err.message : "Something went wrong",
    });
};

export default errorHandler;