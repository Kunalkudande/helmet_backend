import { logger } from '../utils/logger';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export interface BrevoEmailPayload {
  to: string;
  subject: string;
  htmlContent: string;
  senderName?: string;
  senderEmail?: string;
}

/**
 * Send a transactional email via Brevo HTTP API.
 * Uses native fetch (Node 18+) — no SMTP, works on all cloud platforms.
 */
export async function sendBrevoEmail(payload: BrevoEmailPayload): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not set');
  }

  const senderEmail = payload.senderEmail || process.env.EMAIL_FROM || 'bikersbrain.official@gmail.com';
  const senderName  = payload.senderName  || 'Bikers Brain';

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: payload.to }],
      subject: payload.subject,
      htmlContent: payload.htmlContent,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brevo API error ${response.status}: ${errorBody}`);
  }
}

/**
 * Verify Brevo config at startup (non-blocking).
 */
export function verifyEmailConfig(): void {
  if (!process.env.BREVO_API_KEY) {
    logger.warn('⚠️  BREVO_API_KEY not set — emails will not be sent');
  } else {
    logger.info('✅ Brevo email configured');
  }
}
