import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

/**
 * Custom application error class
 */
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Handle Prisma-specific errors
 */
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    case 'P2002': {
      return new ConflictError('A record with this value already exists');
    }
    case 'P2025':
      return new NotFoundError('Record');
    case 'P2003':
      return new ValidationError('Invalid reference. Related record does not exist.');
    case 'P2014':
      return new ValidationError('Invalid relation specified.');
    case 'P2021':
      return new AppError('Database table does not exist', 500);
    default:
      logger.error(`Unhandled Prisma error: ${error.code}`, error);
      return new AppError('Database operation failed', 500);
  }
}

/**
 * Global error handler middleware
 * Catches all errors and returns a standardized response
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.headers['x-request-id'] as string;

  // Log the error with request context
  if (err instanceof AppError && err.isOperational) {
    logger.warn(`[${requestId}] Operational error: ${err.message}`);
  } else {
    logger.error(`[${requestId}] Unexpected error:`, err);
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: messages,
      requestId,
    });
    return;
  }

  // Custom application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      requestId,
    });
    return;
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const appError = handlePrismaError(err);
    res.status(appError.statusCode).json({
      success: false,
      error: appError.message,
      code: appError.code,
      requestId,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      success: false,
      error: 'Invalid data provided',
      code: 'VALIDATION_ERROR',
      requestId,
    });
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: 'Invalid token',
      code: 'INVALID_TOKEN',
      requestId,
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: 'Token expired. Please login again.',
      code: 'TOKEN_EXPIRED',
      requestId,
    });
    return;
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    const multerErr = err as unknown as { code: string };
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: 'File too large. Maximum size is 5MB.',
      LIMIT_FILE_COUNT: 'Too many files. Maximum is 10 files.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field.',
    };
    res.status(400).json({
      success: false,
      error: messages[multerErr.code] || 'File upload error',
      code: 'UPLOAD_ERROR',
      requestId,
    });
    return;
  }

  // Default 500 error — never expose stack traces in production
  res.status(500).json({
    success: false,
    error:
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
    code: 'INTERNAL_ERROR',
    requestId,
  });
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  const requestId = req.headers['x-request-id'] as string;
  res.status(404).json({
    success: false,
    error: 'The requested resource was not found',
    code: 'ROUTE_NOT_FOUND',
    requestId,
  });
}
