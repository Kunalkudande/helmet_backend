import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

/**
 * Create and configure Nodemailer transporter
 */
export function createEmailTransporter(): nodemailer.Transporter {
  const port = parseInt(process.env.EMAIL_PORT || '465', 10);
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 10000,  // 10 s — fail fast instead of hanging
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transporter;
}

/**
 * Verify email transporter connection
 */
export async function verifyEmailConfig(): Promise<void> {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    logger.warn('⚠️  Email not configured — emails will not be sent');
    return;
  }

  // Verify in the background — don't block server startup
  setImmediate(async () => {
    try {
      const transporter = createEmailTransporter();
      await transporter.verify();
      logger.info('✅ Email transporter configured');
    } catch (error) {
      logger.warn('⚠️  Email configuration error — emails may not work:', error);
    }
  });
}
