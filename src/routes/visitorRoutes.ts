import { Router } from 'express';
import { trackVisit } from '../controllers/visitorController';
import { visitorLimiter } from '../middleware/rateLimiter';
import { optionalAuth } from '../middleware/auth';

const router = Router();

// Public — called from frontend on every page load (rate-limited to prevent abuse)
router.post('/track', visitorLimiter, optionalAuth, trackVisit);

export default router;
