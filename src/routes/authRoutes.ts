import { Router } from 'express';
import {
  register,
  login,
  logout,
  refreshToken,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getMe,
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimiter';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../utils/validators';

const router = Router();

// Public routes
router.post('/register', authLimiter, validateBody(registerSchema), register);
router.post('/login', authLimiter, validateBody(loginSchema), login);
router.post('/logout', logout);
router.post('/refresh-token', authLimiter, refreshToken);
router.post('/verify-email', authLimiter, verifyEmail);
router.post('/forgot-password', passwordResetLimiter, validateBody(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', passwordResetLimiter, validateBody(resetPasswordSchema), resetPassword);

// Protected routes
router.get('/me', authenticate, getMe);

export default router;
