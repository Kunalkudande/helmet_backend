import multer from 'multer';
import path from 'path';
import { AppError } from './errorHandler';

/**
 * Multer configuration for file uploads
 * - Memory storage (files are kept in buffer for Cloudinary upload)
 * - File type validation (images only)
 * - File size limit (5 MB)
 */

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const ext = path.extname(file.originalname);
    cb(
      new AppError(
        `Invalid file type "${ext}". Only JPEG, PNG, WebP and GIF images are allowed.`,
        400
      )
    );
  }
}

/**
 * Upload middleware — single file
 */
export const uploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).single('image');

/**
 * Upload middleware — multiple files (max 10)
 */
export const uploadMultiple = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).array('images', 10);

/**
 * Upload middleware — review images (max 5)
 */
export const uploadReviewImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).array('images', 5);
