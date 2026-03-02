import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../types';

/**
 * Extract device, browser, and OS from a user-agent string.
 */
function parseUserAgent(ua: string = ''): { device: string; browser: string; os: string } {
  const lower = ua.toLowerCase();

  // Device
  let device = 'desktop';
  if (/mobile|android.*mobile|iphone|ipod/.test(lower)) device = 'mobile';
  else if (/tablet|ipad|android(?!.*mobile)/.test(lower)) device = 'tablet';

  // Browser (order matters — Edge contains "chrome", so check it first)
  let browser = 'Other';
  if (lower.includes('edg/')) browser = 'Edge';
  else if (lower.includes('opr/') || lower.includes('opera')) browser = 'Opera';
  else if (lower.includes('chrome') && !lower.includes('chromium')) browser = 'Chrome';
  else if (lower.includes('firefox')) browser = 'Firefox';
  else if (lower.includes('safari') && !lower.includes('chrome')) browser = 'Safari';

  // OS
  let os = 'Other';
  if (lower.includes('windows')) os = 'Windows';
  else if (lower.includes('mac os') || lower.includes('macintosh')) os = 'macOS';
  else if (lower.includes('android')) os = 'Android';
  else if (/iphone|ipad|ipod/.test(lower)) os = 'iOS';
  else if (lower.includes('linux')) os = 'Linux';

  return { device, browser, os };
}

/**
 * POST /api/visitors/track
 *
 * Records one visit per browser session.
 * The frontend generates a sessionId (stored in sessionStorage) and calls this
 * once on initial load. If the sessionId already exists we skip — no duplicates.
 */
export async function trackVisit(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const { page, referrer, sessionId } = req.body;

    if (!page || !sessionId) {
      res.status(400).json({ success: false, message: 'page and sessionId required' });
      return;
    }

    // Sanitise inputs
    const safePage = String(page).slice(0, 500);
    const safeReferrer = referrer ? String(referrer).slice(0, 1000) : null;
    const safeSessionId = String(sessionId).slice(0, 100);

    // One row per session — skip if already tracked
    const exists = await prisma.visitor.findUnique({ where: { sessionId: safeSessionId } });
    if (exists) {
      res.json({ success: true });
      return;
    }

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';

    const userAgent = (req.headers['user-agent'] || '').slice(0, 500);
    const { device, browser, os } = parseUserAgent(userAgent);

    await prisma.visitor.create({
      data: {
        ip,
        userAgent,
        page: safePage,
        referrer: safeReferrer,
        device,
        browser,
        os,
        sessionId: safeSessionId,
      },
    });

    res.json({ success: true });
  } catch {
    // Never let tracking errors break the user experience
    res.json({ success: true });
  }
}

/**
 * GET /api/admin/visitors?days=30
 *
 * Returns simple, actionable analytics for the admin dashboard.
 */
export async function getVisitorStats(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const daysNum = Math.min(90, Math.max(1, parseInt(req.query.days as string, 10) || 30));

    const since = new Date();
    since.setDate(since.getDate() - daysNum);
    since.setHours(0, 0, 0, 0);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalVisitors,
      uniqueIPs,
      todayVisitors,
      todayUniqueIPs,
      topPages,
      deviceBreakdown,
      browserBreakdown,
      recentVisitors,
      dailyVisits,
    ] = await Promise.all([
      // Total sessions in period
      prisma.visitor.count({ where: { createdAt: { gte: since } } }),

      // Unique IPs in period
      prisma.visitor.groupBy({
        by: ['ip'],
        where: { createdAt: { gte: since } },
      }).then((rows) => rows.length),

      // Today's sessions
      prisma.visitor.count({ where: { createdAt: { gte: todayStart } } }),

      // Today's unique IPs
      prisma.visitor.groupBy({
        by: ['ip'],
        where: { createdAt: { gte: todayStart } },
      }).then((rows) => rows.length),

      // Top landing pages
      prisma.visitor.groupBy({
        by: ['page'],
        where: { createdAt: { gte: since } },
        _count: { page: true },
        orderBy: { _count: { page: 'desc' } },
        take: 10,
      }),

      // Device breakdown
      prisma.visitor.groupBy({
        by: ['device'],
        where: { createdAt: { gte: since } },
        _count: { device: true },
        orderBy: { _count: { device: 'desc' } },
      }),

      // Browser breakdown
      prisma.visitor.groupBy({
        by: ['browser'],
        where: { createdAt: { gte: since } },
        _count: { browser: true },
        orderBy: { _count: { browser: 'desc' } },
      }),

      // Recent 50 visitors
      prisma.visitor.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          ip: true,
          page: true,
          device: true,
          browser: true,
          os: true,
          referrer: true,
          createdAt: true,
        },
      }),

      // Daily visitor counts for chart
      prisma.$queryRaw`
        SELECT
          DATE("createdAt")               AS date,
          COUNT(*)::int                   AS visitors,
          COUNT(DISTINCT "ip")::int       AS "uniqueIPs"
        FROM "Visitor"
        WHERE "createdAt" >= ${since}
        GROUP BY DATE("createdAt")
        ORDER BY DATE("createdAt") ASC
      `,
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalVisitors,
          uniqueIPs,
        },
        today: {
          visitors: todayVisitors,
          uniqueIPs: todayUniqueIPs,
        },
        topPages: topPages.map((p: any) => ({ page: p.page, count: p._count.page })),
        devices: deviceBreakdown.map((d: any) => ({ device: d.device || 'Unknown', count: d._count.device })),
        browsers: browserBreakdown.map((b: any) => ({ browser: b.browser || 'Unknown', count: b._count.browser })),
        recentVisitors,
        dailyVisits,
        period: `${daysNum} days`,
      },
    });
  } catch (error) {
    next(error);
  }
}
