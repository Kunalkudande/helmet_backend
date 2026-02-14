import { v2 as cloudinary } from 'cloudinary';
import { logger } from '../utils/logger';

/**
 * Configure Cloudinary for image uploads
 */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Verify Cloudinary configuration
 */
export async function verifyCloudinaryConfig(): Promise<void> {
  try {
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      logger.warn('⚠️  Cloudinary not configured — image uploads will fail');
      return;
    }
    logger.info('✅ Cloudinary configured');
  } catch (error) {
    logger.warn('⚠️  Cloudinary configuration error:', error);
  }
}

export default cloudinary;
