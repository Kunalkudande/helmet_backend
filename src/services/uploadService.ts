import cloudinary from '../config/cloudinary';
import { logger } from '../utils/logger';
import { CloudinaryUploadResult } from '../types';

/**
 * Upload a single image buffer to Cloudinary
 */
export async function uploadImage(
  fileBuffer: Buffer,
  folder: string = 'helmet-store/products'
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          { width: 1200, height: 1200, crop: 'limit' },
          { quality: 'auto' },
          { fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error) {
          logger.error('Cloudinary upload failed:', error);
          reject(new Error('Image upload failed'));
        } else if (result) {
          resolve({
            public_id: result.public_id,
            secure_url: result.secure_url,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
          });
        }
      }
    );

    stream.end(fileBuffer);
  });
}

/**
 * Upload multiple image buffers to Cloudinary
 */
export async function uploadMultipleImages(
  files: Express.Multer.File[],
  folder: string = 'helmet-store/products'
): Promise<CloudinaryUploadResult[]> {
  const uploadPromises = files.map((file) => uploadImage(file.buffer, folder));
  return Promise.all(uploadPromises);
}

/**
 * Delete an image from Cloudinary by public_id
 */
export async function deleteImage(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
    logger.info(`Image deleted from Cloudinary: ${publicId}`);
  } catch (error) {
    logger.error('Failed to delete image from Cloudinary:', error);
  }
}
