import crypto from 'crypto';
import { getRazorpayInstance } from '../config/razorpay';
import { logger } from '../utils/logger';

interface RazorpayOrderOptions {
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

interface RazorpayOrderResult {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
}

/**
 * Create a Razorpay order
 */
export async function createRazorpayOrder(
  amount: number,
  receipt: string,
  notes: Record<string, string> = {}
): Promise<RazorpayOrderResult> {
  try {
    // Validate amount
    if (amount <= 0) {
      throw new Error('Invalid amount');
    }

    const razorpay = getRazorpayInstance();

    // Razorpay expects amount in paise (smallest currency unit)
    const amountInPaise = Math.round(amount * 100);
    
    const options: RazorpayOrderOptions = {
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes,
    };

    const order = await razorpay.orders.create(options);

    logger.info(`Razorpay order created: ${order.id} (amount: ₹${amount})`);

    return {
      id: order.id,
      amount: order.amount as number,
      currency: order.currency,
      receipt: order.receipt || receipt,
    };
  } catch (error) {
    logger.error('Failed to create Razorpay order:', error);
    
    if ((error as Error).message.includes('Invalid')) {
      throw new Error('Invalid payment details');
    }
    
    throw new Error('Payment gateway error. Please try again.');
  }
}

/**
 * Verify Razorpay payment signature
 * Uses HMAC SHA256 to verify the payment authenticity
 */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  try {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new Error('RAZORPAY_KEY_SECRET not configured');

    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');

    if (expectedBuf.length !== signatureBuf.length) {
      logger.info('Razorpay signature verification: INVALID (length mismatch)');
      return false;
    }

    const isValid = crypto.timingSafeEqual(expectedBuf, signatureBuf);
    logger.info(`Razorpay signature verification: ${isValid ? 'valid' : 'INVALID'}`);

    return isValid;
  } catch (error) {
    logger.error('Razorpay signature verification failed:', error);
    return false;
  }
}

/**
 * Fetch Razorpay payment details
 */
export async function fetchPaymentDetails(paymentId: string) {
  try {
    const razorpay = getRazorpayInstance();
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    logger.error('Failed to fetch payment details:', error);
    throw new Error('Could not fetch payment details');
  }
}
