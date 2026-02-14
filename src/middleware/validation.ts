import { Request, Response, NextFunction } from 'express';
import { ZodSchema, z } from 'zod';

/**
 * UUID validation regex
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Middleware factory to validate request body against a Zod schema
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error); // Handled by global error handler
    }
  };
}

/**
 * Middleware factory to validate request query against a Zod schema
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware factory to validate request params against a Zod schema
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to validate that a specific param is a valid UUID
 */
export function validateUuidParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    if (!value || !UUID_REGEX.test(value)) {
      res.status(400).json({
        success: false,
        error: `Invalid ${paramName} format. Expected UUID.`,
      });
      return;
    }
    next();
  };
}

/**
 * Common param schemas
 */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export const slugParamSchema = z.object({
  slug: z.string().min(1, 'Slug is required'),
});
