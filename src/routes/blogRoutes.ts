import { Router } from 'express';
import {
  getPublishedPosts,
  getPostBySlug,
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
} from '../controllers/blogController';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/admin';

const router = Router();

// Public routes
router.get('/', getPublishedPosts);
router.get('/:slug', getPostBySlug);

// Admin routes
router.get('/admin/all', authenticate, adminOnly, getAllPosts);
router.get('/admin/:id', authenticate, adminOnly, getPostById);
router.post('/admin', authenticate, adminOnly, createPost);
router.put('/admin/:id', authenticate, adminOnly, updatePost);
router.delete('/admin/:id', authenticate, adminOnly, deletePost);

export default router;
