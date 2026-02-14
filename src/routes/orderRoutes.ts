import { Router } from 'express';
import {
  createOrder,
  verifyPayment,
  getUserOrders,
  getOrderById,
  cancelOrder,
  validateCoupon,
} from '../controllers/orderController';
import { authenticate } from '../middleware/auth';
import { validateBody, validateUuidParam } from '../middleware/validation';
import { orderLimiter } from '../middleware/rateLimiter';
import { createOrderSchema, verifyPaymentSchema } from '../utils/validators';

const router = Router();

// All order routes require authentication
router.use(authenticate);

router.post('/', orderLimiter, validateBody(createOrderSchema), createOrder);
router.post('/verify-payment', validateBody(verifyPaymentSchema), verifyPayment);
router.post('/validate-coupon', validateCoupon);
router.get('/', getUserOrders);
router.get('/:id', validateUuidParam('id'), getOrderById);
router.put('/:id/cancel', validateUuidParam('id'), cancelOrder);

export default router;
