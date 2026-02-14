import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import crypto from 'crypto';
import { validateEnv } from './config/env';
import { connectDatabase, disconnectDatabase, prisma } from './config/database';
import { verifyCloudinaryConfig } from './config/cloudinary';
import { verifyEmailConfig } from './config/email';
import { apiLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger, morganStream } from './utils/logger';

// Validate environment variables early
const env = validateEnv();

// Route imports
import authRoutes from './routes/authRoutes';
import productRoutes from './routes/productRoutes';
import orderRoutes from './routes/orderRoutes';
import cartRoutes from './routes/cartRoutes';
import userRoutes from './routes/userRoutes';
import adminRoutes from './routes/adminRoutes';
import visitorRoutes from './routes/visitorRoutes';

const app = express();
const PORT = parseInt(env.PORT, 10);

// Trust first proxy (Nginx/Docker/Render) — required for correct rate limiting by real IP
app.set('trust proxy', 1);

/* ─────────────────── Global Middleware ─────────────────── */

// Request ID for tracing (add before other middleware)
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

// Compression
app.use(compression({
  filter: (req: express.Request, res: express.Response) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  level: 6,
}));

// Security headers
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  })
);

// Rate limiting
app.use('/api/', apiLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Cookie parsing (for refresh tokens)
app.use(cookieParser());

// HTTP request logging
app.use(morgan('combined', { stream: morganStream }));

/* ─────────────────── API Routes ─────────────────── */

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/visitors', visitorRoutes);

// Health check — lightweight, no sensitive info
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'OK',
      timestamp: new Date().toISOString(),
    },
  });
});

// Detailed health check — only in non-production or behind auth
app.get('/api/health/detailed', async (_req, res) => {
  // Don't expose system internals in production
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ success: false, error: 'Not available' });
    return;
  }

  const checks: Record<string, { status: string; latency?: number }> = {};
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'healthy', latency: Date.now() - dbStart };
  } catch {
    checks.database = { status: 'unhealthy' };
  }

  const allHealthy = Object.values(checks).every((c) => c.status === 'healthy');

  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    data: {
      status: allHealthy ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      checks,
    },
  });
});

/* ─────────────────── Error Handling ─────────────────── */

app.use(notFoundHandler);
app.use(errorHandler);

/* ─────────────────── Server Startup ─────────────────── */

async function startServer(): Promise<void> {
  try {
    // Connect to database
    await connectDatabase();

    // Verify external service configs
    await verifyCloudinaryConfig();
    await verifyEmailConfig();

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`📝 Environment: ${env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down...');
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down...');
  await disconnectDatabase();
  process.exit(0);
});

startServer();

export default app;
