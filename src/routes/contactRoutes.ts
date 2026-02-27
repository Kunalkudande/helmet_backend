import { Router } from 'express';
import { submitContactForm } from '../controllers/contactController';
import { validateBody } from '../middleware/validation';
import { contactSchema } from '../utils/validators';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

// Public — rate-limited to prevent spam
router.post('/', authLimiter, validateBody(contactSchema), submitContactForm);

export default router;
