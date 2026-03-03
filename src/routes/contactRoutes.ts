import { Router } from 'express';
import { submitContactForm, submitBulkInquiry } from '../controllers/contactController';
import { validateBody } from '../middleware/validation';
import { contactSchema, bulkInquirySchema } from '../utils/validators';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

// Public — rate-limited to prevent spam
router.post('/', authLimiter, validateBody(contactSchema), submitContactForm);
router.post('/bulk-inquiry', authLimiter, validateBody(bulkInquirySchema), submitBulkInquiry);

export default router;
