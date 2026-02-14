import { Router } from 'express';
import { trackVisit } from '../controllers/visitorController';
import { visitorLimiter } from '../middleware/rateLimiter';

const router = Router();

// Public — called from frontend on every page load (rate-limited to prevent abuse)
router.post('/track', visitorLimiter, trackVisit);

export default router;
