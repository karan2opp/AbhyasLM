export class ApiError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;

    constructor(statusCode: number, message: string) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true; // Indicates it's a known, handled error
        Error.captureStackTrace(this, this.constructor);
    }

    static badRequest(message = "Bad Request") {
        return new ApiError(400, message);
    }

    static unauthorized(message = "Unauthorized") {
        return new ApiError(401, message);
    }

    static forbidden(message = "Forbidden") {
        return new ApiError(403, message);
    }

    static notFound(message = "Not Found") {
        return new ApiError(404, message);
    }

    static conflict(message = "Conflict") {
        return new ApiError(409, message);
    }
    
    static internal(message = "Internal Server Error") {
        return new ApiError(500, message);
    }
}
