import { Request, Response, NextFunction } from 'express';
import { sendBrevoEmail } from '../config/email';
import { logger } from '../utils/logger';

const SITE_NAME = 'Bikers Brain';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || 'bikersbrain.official@gmail.com';

/** Escape HTML special chars to prevent XSS in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Wrap email body in a proper HTML document with UTF-8 charset */
function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin: 0; padding: 0;">
  ${body}
</body>
</html>`;
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

    if (process.env.BREVO_API_KEY) {
      await sendBrevoEmail({
        to: ADMIN_EMAIL,
        subject: `[Contact Form] ${safeSubject}`,
        senderName: `${SITE_NAME} Contact`,
        htmlContent: wrapHtml(`
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
        `),
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
    res.json({
      success: true,
      data: null,
      message: 'Thank you for contacting us! We will get back to you within 24 hours.',
    });
  }
}

/**
 * POST /api/contact/bulk-inquiry
 * Handle bulk / wholesale order inquiries
 */
export async function submitBulkInquiry(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const {
      name, email, phone, businessName, quantity,
      message, productName, productSlug, productUrl,
    } = req.body;

    const safeName = escapeHtml(String(name));
    const safeEmail = escapeHtml(String(email));
    const safePhone = escapeHtml(String(phone));
    const safeBusiness = businessName ? escapeHtml(String(businessName)) : '&#8212;';
    const safeProduct = escapeHtml(String(productName));
    const safeMessage = message ? escapeHtml(String(message)) : '';
    const safeQty = Number(quantity) || 0;
    const safeUrl = escapeHtml(String(productUrl || ''));

    if (process.env.BREVO_API_KEY) {
      await sendBrevoEmail({
        to: ADMIN_EMAIL,
        subject: `Bulk Order: ${safeProduct} - ${safeQty} units by ${safeName}`,
        htmlContent: wrapHtml(`
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08);">
            <div style="background: linear-gradient(135deg, #FF6B35, #EA580C); padding: 28px 24px;">
              <h2 style="color: #fff; margin: 0; font-size: 20px;">New Bulk Order Inquiry</h2>
              <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Someone is interested in ordering in bulk!</p>
            </div>

            <div style="padding: 24px;">
              <h3 style="color: #1f2937; margin: 0 0 20px; font-size: 17px;">Product: ${safeProduct}</h3>

              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 8px; font-weight: 600; color: #666; border-bottom: 1px solid #f3f4f6; width: 140px;">Customer</td>
                  <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${safeName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 8px; font-weight: 600; color: #666; border-bottom: 1px solid #f3f4f6;">Email</td>
                  <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6;"><a href="mailto:${safeEmail}" style="color: #FF6B35;">${safeEmail}</a></td>
                </tr>
                <tr>
                  <td style="padding: 12px 8px; font-weight: 600; color: #666; border-bottom: 1px solid #f3f4f6;">Phone</td>
                  <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6;"><a href="tel:+91${safePhone}" style="color: #FF6B35;">+91 ${safePhone}</a></td>
                </tr>
                <tr>
                  <td style="padding: 12px 8px; font-weight: 600; color: #666; border-bottom: 1px solid #f3f4f6;">Business</td>
                  <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${safeBusiness}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 8px; font-weight: 600; color: #666; border-bottom: 1px solid #f3f4f6;">Quantity</td>
                  <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6;"><strong style="color: #FF6B35; font-size: 20px;">${safeQty} units</strong></td>
                </tr>
                <tr>
                  <td style="padding: 12px 8px; font-weight: 600; color: #666; border-bottom: 1px solid #f3f4f6;">Product Link</td>
                  <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6;"><a href="${safeUrl}" style="color: #FF6B35; word-break: break-all;">${safeUrl}</a></td>
                </tr>
              </table>

              ${safeMessage ? `
              <div style="background: #f9fafb; padding: 16px; border-radius: 6px; margin-top: 20px;">
                <h4 style="margin: 0 0 8px; color: #374151;">Additional Details:</h4>
                <p style="margin: 0; color: #555; line-height: 1.6;">${safeMessage}</p>
              </div>` : ''}

              <div style="margin-top: 24px; text-align: center;">
                <a href="tel:+91${safePhone}" style="display: inline-block; background: #FF6B35; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 0 6px 8px;">Call Customer</a>
                <a href="mailto:${safeEmail}" style="display: inline-block; background: #1f2937; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 0 6px 8px;">Reply via Email</a>
              </div>
            </div>

            <div style="padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb; background: #f9fafb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">${SITE_NAME} - Bulk Order Notification</p>
            </div>
          </div>
        `),
      });
      logger.info(`Bulk inquiry email sent to admin: ${safeProduct} x ${safeQty} by ${safeName} (${safeEmail})`);
    } else {
      logger.warn(`Bulk inquiry received but email not configured: ${safeProduct} x ${safeQty} by ${safeEmail}`);
    }

    res.json({
      success: true,
      data: null,
      message: 'Bulk inquiry submitted! We will contact you within 24 hours.',
    });
  } catch (error) {
    logger.error('Bulk inquiry failed:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Something went wrong. Please try again or contact us directly.',
    });
  }
}
