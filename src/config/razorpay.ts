import Razorpay from 'razorpay';
import { logger } from '../utils/logger';

let razorpayInstance: Razorpay | null = null;

/**
 * Get singleton Razorpay instance
 */
export function getRazorpayInstance(): Razorpay {
  if (!razorpayInstance) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      logger.warn('⚠️  Razorpay credentials not configured');
      throw new Error('Razorpay credentials not configured');
    }

    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    logger.info('✅ Razorpay initialized');
  }

  return razorpayInstance;
}

export default getRazorpayInstance;
