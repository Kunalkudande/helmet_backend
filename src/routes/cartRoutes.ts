import { Router } from 'express';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} from '../controllers/cartController';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { addToCartSchema, updateCartItemSchema } from '../utils/validators';

const router = Router();

// All cart routes require authentication
router.use(authenticate);

router.get('/', getCart);
router.post('/items', validateBody(addToCartSchema), addToCart);
router.put('/items/:itemId', validateBody(updateCartItemSchema), updateCartItem);
router.delete('/items/:itemId', removeFromCart);
router.delete('/', clearCart);

export default router;
