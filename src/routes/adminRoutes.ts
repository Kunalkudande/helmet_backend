import { Router } from 'express';
import {
  getDashboardStats,
  getAllOrders,
  updateOrderStatus,
  getCustomers,
  approveReview,
  createCoupon,
  getCoupons,
  deleteCoupon,
  toggleCoupon,
  subscribeNewsletter,
} from '../controllers/adminController';
import { getVisitorStats } from '../controllers/visitorController';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/admin';
import { validateBody } from '../middleware/validation';
import {
  updateOrderStatusSchema,
  couponSchema,
  newsletterSchema,
  approveReviewSchema,
} from '../utils/validators';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

// Newsletter — public (rate-limited to prevent abuse)
router.post('/newsletter/subscribe', authLimiter, validateBody(newsletterSchema), subscribeNewsletter);

// Admin routes — require authentication + admin role
router.use(authenticate, adminOnly);

router.get('/dashboard', getDashboardStats);

// Orders
router.get('/orders', getAllOrders);
router.put('/orders/:id/status', validateBody(updateOrderStatusSchema), updateOrderStatus);

// Customers
router.get('/customers', getCustomers);

// Reviews
router.put('/reviews/:id/approve', validateBody(approveReviewSchema), approveReview);

// Coupons
router.get('/coupons', getCoupons);
router.post('/coupons', validateBody(couponSchema), createCoupon);
router.put('/coupons/:id/toggle', toggleCoupon);
router.delete('/coupons/:id', deleteCoupon);

// Visitors
router.get('/visitors', getVisitorStats);

export default router;
