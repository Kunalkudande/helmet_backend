import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// Singleton pattern to prevent multiple Prisma Client instances in dev
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000; // 3 seconds base delay

/**
 * Connect to the database with exponential backoff retries.
 * Retries up to MAX_RETRIES times before exiting.
 */
export async function connectDatabase(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Disconnect first so Prisma resets any broken connection state
      await prisma.$disconnect().catch(() => {});
      await prisma.$connect();
      logger.info('✅ Database connected successfully');
      return;
    } catch (error) {
      logger.error(`❌ Database connection attempt ${attempt}/${MAX_RETRIES} failed:`, error);

      if (attempt === MAX_RETRIES) {
        logger.error('💀 All database connection attempts exhausted. Exiting.');
        process.exit(1);
      }

      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // exponential backoff
      logger.info(`⏳ Retrying database connection in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Disconnect from the database gracefully
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
