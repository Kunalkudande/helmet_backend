import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

/**
 * Create and configure Nodemailer transporter
 */
export function createEmailTransporter(): nodemailer.Transporter {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return transporter;
}

/**
 * Verify email transporter connection
 */
export async function verifyEmailConfig(): Promise<void> {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      logger.warn('⚠️  Email not configured — emails will not be sent');
      return;
    }

    const transporter = createEmailTransporter();
    await transporter.verify();
    logger.info('✅ Email transporter configured');
  } catch (error) {
    logger.warn('⚠️  Email configuration error — emails may not work:', error);
  }
}
