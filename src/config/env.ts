import { z } from 'zod';
import { logger } from '../utils/logger';

/**
 * Environment variable schema
 * Validates all required and optional environment variables
 */
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),

  // Database (required)
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // JWT (required)
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRE: z.string().default('30m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRE: z.string().default('7d'),

  // Razorpay (required for payments)
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),

  // Cloudinary (required for image uploads)
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Email (optional – emails won't be sent if not configured)
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.string().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Frontend URL for CORS and email links
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // Bcrypt
  BCRYPT_ROUNDS: z.string().default('10'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate environment variables and return typed config
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map((e) => `  - ${e.path.join('.')}: ${e.message}`);
    logger.error('❌ Invalid environment configuration:');
    errors.forEach((e) => logger.error(e));
    process.exit(1);
  }

  // Warn about optional configs
  const env = result.data;

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    logger.warn('⚠️  Razorpay not configured – payments will not work');
  }

  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY) {
    logger.warn('⚠️  Cloudinary not configured – image uploads will not work');
  }

  if (!env.EMAIL_USER || !env.EMAIL_PASS) {
    logger.warn('⚠️  Email not configured – emails will not be sent');
  }


  logger.info('✅ Environment configuration validated');

  return env;
}

/**
 * Get validated environment config (lazy singleton)
 */
let envConfig: Env | null = null;

export function getEnv(): Env {
  if (!envConfig) {
    envConfig = validateEnv();
  }
  return envConfig;
}
