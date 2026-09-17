// src/common/middleware/validateMiddleware.ts
import type { Request, Response, NextFunction } from "express"
import type { ZodSchema, ZodError } from "zod"
import { ApiError } from "../utils/ApiError.js"

const validate = (schema: ZodSchema) => (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
        const errors = result.error.issues.map((e: any) => e.message).join(", ")
        throw ApiError.badRequest(errors)
    }
    req.body = result.data  // replace req.body with parsed/cleaned data
    next()
}

export default validate