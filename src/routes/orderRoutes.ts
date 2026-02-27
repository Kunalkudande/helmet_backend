import { Router } from 'express';
import {
  createOrder,
  verifyPayment,
  getUserOrders,
  getOrderById,
  cancelOrder,
  validateCoupon,
  createGuestOrder,
  verifyGuestPayment,
  createRazorpayCheckout,
  createGuestRazorpayCheckout,
  verify1CCPayment,
  verifyGuest1CCPayment,
  trackOrder,
} from '../controllers/orderController';
import { authenticate } from '../middleware/auth';
import { validateBody, validateUuidParam } from '../middleware/validation';
import { orderLimiter } from '../middleware/rateLimiter';
import { createOrderSchema, verifyPaymentSchema, guestOrderSchema, verifyGuestPaymentSchema, validateCouponSchema } from '../utils/validators';

const router = Router();

// ── Public routes (no auth required) ─────────────────────────────────────────
router.get('/track/:orderNumber', trackOrder);

// ── Guest routes (no auth required) ──────────────────────────────────────────
router.post('/guest', orderLimiter, validateBody(guestOrderSchema), createGuestOrder);
router.post('/guest/verify-payment', validateBody(verifyGuestPaymentSchema), verifyGuestPayment);
router.post('/guest/razorpay-checkout', orderLimiter, createGuestRazorpayCheckout);
router.post('/guest/verify-1cc-payment', verifyGuest1CCPayment);
router.post('/validate-coupon', validateBody(validateCouponSchema), validateCoupon);

// ── Authenticated routes ──────────────────────────────────────────────────────
router.use(authenticate);

router.post('/', orderLimiter, validateBody(createOrderSchema), createOrder);
router.post('/verify-payment', validateBody(verifyPaymentSchema), verifyPayment);
router.post('/razorpay-checkout', orderLimiter, createRazorpayCheckout);
router.post('/verify-1cc-payment', verify1CCPayment);
router.get('/', getUserOrders);
router.get('/:id', validateUuidParam('id'), getOrderById);
router.put('/:id/cancel', validateUuidParam('id'), cancelOrder);

export default router;
