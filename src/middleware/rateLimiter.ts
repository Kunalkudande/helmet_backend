import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Key generator that uses req.ip (which respects trust proxy setting)
 * When trust proxy is enabled, Express resolves the real client IP from X-Forwarded-For
 */
function keyGenerator(req: Request): string {
  return req.ip || 'unknown';
}

/**
 * Skip rate limiting for health checks and static files
 */
function skipSuccessfulRequests(req: Request): boolean {
  return req.path === '/api/health' || req.path === '/api/health/detailed';
}

/**
 * Handler when rate limit is exceeded
 */
function rateLimitHandler(_req: Request, res: Response): void {
  res.status(429).json({
    success: false,
    error: 'Too many requests. Please try again later.',
    retryAfter: res.getHeader('Retry-After'),
  });
}

/**
 * General API rate limiter — 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  message: {
    success: false,
    error: 'Too many requests. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  skip: skipSuccessfulRequests,
  handler: rateLimitHandler,
});

/**
 * Strict limiter for auth routes — 10 requests per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
});

/**
 * Password reset limiter — 5 requests per hour
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    success: false,
    error: 'Too many password reset attempts. Please try again after 1 hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
});

/**
 * Order creation limiter — prevent abuse
 */
export const orderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: {
    success: false,
    error: 'Too many order attempts. Please wait a moment.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitHandler,
});

/**
 * Visitor tracking limiter — prevent database flooding
 * 30 requests per minute per IP (generous for page navigation)
 */
export const visitorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator,
  handler: (_req: Request, res: Response): void => {
    res.json({ success: true });
  },
});
