import { Router } from 'express';
import {
  getProducts,
  getAdminProducts,
  getProductBySlug,
  getAdminProductBySlug,
  getRelatedProducts,
  searchAutocomplete,
  getFeaturedProducts,
  getCategoryCounts,
  createProduct,
  updateProduct,
  deleteProduct,
  addProductImages,
  deleteProductImage,
  reorderProductImages,
  setPrimaryImage,
  getBrands,
  getPublicCategories,
  autofillProduct,
} from '../controllers/productController';
import { createReview } from '../controllers/userController';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/admin';
import { validateBody } from '../middleware/validation';
import { createProductSchema, updateProductSchema, createReviewSchema } from '../utils/validators';
import { uploadMultiple } from '../middleware/upload';
import { previewProductImport, commitProductImport, duplicateProduct, getLowStockProducts } from '../controllers/adminCatalogController';

const router = Router();

// Public routes
router.get('/', getProducts);
router.get('/featured', getFeaturedProducts);
router.get('/category-counts', getCategoryCounts);
router.get('/brands', getBrands);
router.get('/categories', getPublicCategories);
router.get('/search/autocomplete', searchAutocomplete);

// Admin product reads
router.get('/admin/list', authenticate, adminOnly, getAdminProducts);
router.get('/admin/low-stock', authenticate, adminOnly, getLowStockProducts);
router.post('/admin/import/preview', authenticate, adminOnly, previewProductImport);
router.post('/admin/import/commit', authenticate, adminOnly, commitProductImport);
router.post('/admin/:id/duplicate', authenticate, adminOnly, duplicateProduct);
router.get('/admin/:slug', authenticate, adminOnly, getAdminProductBySlug);

router.get('/:slug', getProductBySlug);
router.get('/:slug/related', getRelatedProducts);

// Protected routes
router.post('/:productId/reviews', authenticate, validateBody(createReviewSchema), createReview);

// Admin routes
router.post('/autofill', authenticate, adminOnly, autofillProduct);
router.post('/', authenticate, adminOnly, validateBody(createProductSchema), createProduct);
router.put('/:id', authenticate, adminOnly, validateBody(updateProductSchema), updateProduct);
router.delete('/:id', authenticate, adminOnly, deleteProduct);
router.post('/:id/images', authenticate, adminOnly, uploadMultiple, addProductImages);
router.delete('/:id/images/:imageId', authenticate, adminOnly, deleteProductImage);
router.put('/:id/images/reorder', authenticate, adminOnly, reorderProductImages);
router.put('/:id/images/:imageId/primary', authenticate, adminOnly, setPrimaryImage);

export default router;
