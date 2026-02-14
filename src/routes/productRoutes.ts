import { Router } from 'express';
import {
  getProducts,
  getProductBySlug,
  getRelatedProducts,
  searchAutocomplete,
  getFeaturedProducts,
  getCategoryCounts,
  createProduct,
  updateProduct,
  deleteProduct,
  addProductImages,
  deleteProductImage,
  setPrimaryImage,
  getBrands,
} from '../controllers/productController';
import { createReview } from '../controllers/userController';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/admin';
import { validateBody } from '../middleware/validation';
import { createProductSchema, updateProductSchema, createReviewSchema } from '../utils/validators';
import { uploadMultiple } from '../middleware/upload';

const router = Router();

// Public routes
router.get('/', getProducts);
router.get('/featured', getFeaturedProducts);
router.get('/category-counts', getCategoryCounts);
router.get('/brands', getBrands);
router.get('/search/autocomplete', searchAutocomplete);
router.get('/:slug', getProductBySlug);
router.get('/:slug/related', getRelatedProducts);

// Protected routes
router.post('/:productId/reviews', authenticate, validateBody(createReviewSchema), createReview);

// Admin routes
router.post('/', authenticate, adminOnly, validateBody(createProductSchema), createProduct);
router.put('/:id', authenticate, adminOnly, validateBody(updateProductSchema), updateProduct);
router.delete('/:id', authenticate, adminOnly, deleteProduct);
router.post('/:id/images', authenticate, adminOnly, uploadMultiple, addProductImages);
router.delete('/:id/images/:imageId', authenticate, adminOnly, deleteProductImage);
router.put('/:id/images/:imageId/primary', authenticate, adminOnly, setPrimaryImage);

export default router;
