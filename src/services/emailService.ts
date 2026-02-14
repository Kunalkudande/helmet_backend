import { createEmailTransporter } from '../config/email';
import { logger } from '../utils/logger';
import { EmailOptions } from '../types';

const FROM = process.env.EMAIL_FROM || 'noreply@helmetstore.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Send an email using Nodemailer
 */
async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      logger.warn('Email not configured — skipping email send');
      logger.debug(`Would have sent email to ${options.to}: ${options.subject}`);
      return;
    }

    const transporter = createEmailTransporter();
    await transporter.sendMail({
      from: `"Helmet Store" <${FROM}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    logger.info(`Email sent to ${options.to}: ${options.subject}`);
  } catch (error) {
    logger.error(`Failed to send email to ${options.to}:`, error);
    // Don't throw — email failure shouldn't block the operation
  }
}

/**
 * Send email verification link
 */
export async function sendVerificationEmail(
  email: string,
  fullName: string,
  token: string
): Promise<void> {
  const verifyUrl = `${FRONTEND_URL}/verify-email?token=${token}`;

  await sendEmail({
    to: email,
    subject: 'Verify your email - Helmet Store',
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f7; padding: 40px 0;">
        <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08);">
          <div style="background: #FF6B35; padding: 32px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">🏍️ Helmet Store</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #1F2937; margin: 0 0 16px;">Welcome, ${fullName}!</h2>
            <p style="color: #374151; line-height: 1.6;">Thanks for creating an account. Please verify your email to get started.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verifyUrl}" style="background: #FF6B35; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Verify Email</a>
            </div>
            <p style="color: #9CA3AF; font-size: 13px;">If you didn't create an account, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });
}

/**
 * Send password reset link
 */
export async function sendPasswordResetEmail(
  email: string,
  fullName: string,
  token: string
): Promise<void> {
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;

  await sendEmail({
    to: email,
    subject: 'Reset your password - Helmet Store',
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f7; padding: 40px 0;">
        <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08);">
          <div style="background: #FF6B35; padding: 32px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">🏍️ Helmet Store</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #1F2937; margin: 0 0 16px;">Password Reset</h2>
            <p style="color: #374151; line-height: 1.6;">Hi ${fullName}, we received a request to reset your password. Click the button below to set a new password.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetUrl}" style="background: #FF6B35; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
            </div>
            <p style="color: #9CA3AF; font-size: 13px;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });
}

/**
 * Send order confirmation email
 */
export async function sendOrderConfirmationEmail(
  email: string,
  fullName: string,
  orderNumber: string,
  total: number,
  items: { name: string; quantity: number; price: number }[]
): Promise<void> {
  const orderUrl = `${FRONTEND_URL}/account/orders`;
  const itemsHtml = items
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">${item.name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: right;">₹${item.price.toLocaleString('en-IN')}</td>
      </tr>`
    )
    .join('');

  await sendEmail({
    to: email,
    subject: `Order Confirmed #${orderNumber} - Helmet Store`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f7; padding: 40px 0;">
        <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08);">
          <div style="background: #FF6B35; padding: 32px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">🏍️ Helmet Store</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #1F2937; margin: 0 0 8px;">Order Confirmed! ✅</h2>
            <p style="color: #374151; line-height: 1.6;">Hi ${fullName}, your order <strong>#${orderNumber}</strong> has been placed successfully.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
              <thead>
                <tr style="background: #F9FAFB;">
                  <th style="padding: 12px; text-align: left; color: #374151;">Item</th>
                  <th style="padding: 12px; text-align: center; color: #374151;">Qty</th>
                  <th style="padding: 12px; text-align: right; color: #374151;">Price</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>

            <div style="text-align: right; margin: 16px 0; padding: 16px; background: #F9FAFB; border-radius: 6px;">
              <strong style="color: #1F2937; font-size: 18px;">Total: ₹${total.toLocaleString('en-IN')}</strong>
            </div>

            <div style="text-align: center; margin: 24px 0;">
              <a href="${orderUrl}" style="background: #FF6B35; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Track Order</a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  });
}

/**
 * Send order shipped email
 */
export async function sendOrderShippedEmail(
  email: string,
  fullName: string,
  orderNumber: string,
  trackingNumber: string
): Promise<void> {
  await sendEmail({
    to: email,
    subject: `Your Order #${orderNumber} has been shipped! - Helmet Store`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f7; padding: 40px 0;">
        <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08);">
          <div style="background: #FF6B35; padding: 32px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">🏍️ Helmet Store</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #1F2937; margin: 0 0 16px;">Your order is on its way! 🚚</h2>
            <p style="color: #374151; line-height: 1.6;">Hi ${fullName}, your order <strong>#${orderNumber}</strong> has been shipped.</p>
            <div style="background: #F9FAFB; padding: 16px; border-radius: 6px; margin: 16px 0;">
              <p style="color: #374151; margin: 0;">Tracking Number: <strong>${trackingNumber}</strong></p>
            </div>
            <p style="color: #374151;">You can track your order from your account dashboard.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });
}

/**
 * Send order delivered email
 */
export async function sendOrderDeliveredEmail(
  email: string,
  fullName: string,
  orderNumber: string
): Promise<void> {
  const reviewUrl = `${FRONTEND_URL}/account/orders`;

  await sendEmail({
    to: email,
    subject: `Your Order #${orderNumber} has been delivered! - Helmet Store`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f7; padding: 40px 0;">
        <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08);">
          <div style="background: #FF6B35; padding: 32px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">🏍️ Helmet Store</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #1F2937; margin: 0 0 16px;">Order Delivered! 🎉</h2>
            <p style="color: #374151; line-height: 1.6;">Hi ${fullName}, your order <strong>#${orderNumber}</strong> has been delivered successfully.</p>
            <p style="color: #374151;">We hope you love your new helmet! Please leave a review to help other riders.</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${reviewUrl}" style="background: #FF6B35; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Write a Review</a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  });
}
