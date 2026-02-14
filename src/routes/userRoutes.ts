import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  changePassword,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} from '../controllers/userController';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import {
  updateProfileSchema,
  changePasswordSchema,
  addressSchema,
} from '../utils/validators';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// Profile
router.get('/profile', getProfile);
router.put('/profile', validateBody(updateProfileSchema), updateProfile);
router.put('/change-password', validateBody(changePasswordSchema), changePassword);

// Addresses
router.get('/addresses', getAddresses);
router.post('/addresses', validateBody(addressSchema), addAddress);
router.put('/addresses/:id', validateBody(addressSchema), updateAddress);
router.delete('/addresses/:id', deleteAddress);

// Wishlist
router.get('/wishlist', getWishlist);
router.post('/wishlist/:productId', addToWishlist);
router.delete('/wishlist/:productId', removeFromWishlist);

export default router;
