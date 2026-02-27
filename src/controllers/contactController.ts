import { Request, Response, NextFunction } from 'express';
import { createEmailTransporter } from '../config/email';
import { logger } from '../utils/logger';

const SITE_NAME = 'Bikers Brain';
const ADMIN_EMAIL = process.env.EMAIL_USER || 'admin@bikersbrain.com';

/** Escape HTML special chars to prevent XSS in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * POST /api/contact
 * Handle contact form submissions
 */
export async function submitContactForm(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { name, email, subject, message } = req.body;
    const safeName = escapeHtml(String(name));
    const safeEmail = escapeHtml(String(email));
    const safeSubject = escapeHtml(String(subject));
    const safeMessage = escapeHtml(String(message));

    // Try to send email notification to admin
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const transporter = createEmailTransporter();
      await transporter.sendMail({
        from: `"${SITE_NAME} Contact" <${process.env.EMAIL_USER}>`,
        to: ADMIN_EMAIL,
        replyTo: safeEmail,
        subject: `[Contact Form] ${safeSubject}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #FF6B35;">New Contact Form Submission</h2>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; font-weight: bold; color: #666;">Name:</td><td style="padding: 8px;">${safeName}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; color: #666;">Email:</td><td style="padding: 8px;"><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
              <tr><td style="padding: 8px; font-weight: bold; color: #666;">Subject:</td><td style="padding: 8px;">${safeSubject}</td></tr>
            </table>
            <div style="background: #f5f5f5; padding: 16px; border-radius: 6px; margin-top: 16px;">
              <h3 style="margin: 0 0 8px; color: #333;">Message:</h3>
              <p style="margin: 0; color: #555; line-height: 1.6;">${safeMessage}</p>
            </div>
          </div>
        `,
      });
      logger.info(`Contact form submitted by ${safeEmail}: ${safeSubject}`);
    } else {
      logger.info(`Contact form (email not configured) from ${safeEmail}: ${safeSubject}`);
    }

    res.json({
      success: true,
      data: null,
      message: 'Thank you for contacting us! We will get back to you within 24 hours.',
    });
  } catch (error) {
    logger.error('Contact form email failed:', error);
    // Still return success — don't expose email failures to user
    res.json({
      success: true,
      data: null,
      message: 'Thank you for contacting us! We will get back to you within 24 hours.',
    });
  }
}
