import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../types';

/**
 * Parse user-agent string to extract device, browser, and OS
 */
function parseUserAgent(ua: string = '') {
  const lower = ua.toLowerCase();

  // Device
  let device = 'desktop';
  if (/mobile|android.*mobile|iphone|ipod/.test(lower)) device = 'mobile';
  else if (/tablet|ipad|android(?!.*mobile)/.test(lower)) device = 'tablet';

  // Browser
  let browser = 'Other';
  if (lower.includes('edg/')) browser = 'Edge';
  else if (lower.includes('chrome')) browser = 'Chrome';
  else if (lower.includes('firefox')) browser = 'Firefox';
  else if (lower.includes('safari')) browser = 'Safari';
  else if (lower.includes('opera') || lower.includes('opr/')) browser = 'Opera';

  // OS
  let os = 'Other';
  if (lower.includes('windows')) os = 'Windows';
  else if (lower.includes('mac os') || lower.includes('macintosh')) os = 'macOS';
  else if (lower.includes('android')) os = 'Android';
  else if (lower.includes('iphone') || lower.includes('ipad')) os = 'iOS';
  else if (lower.includes('linux')) os = 'Linux';

  return { device, browser, os };
}

/**
 * POST /api/visitors/track
 * Record a visitor session (public — called once per browser session from frontend)
 */
export async function trackVisit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, referrer, sessionId } = req.body;

    if (!page || !sessionId) {
      res.status(400).json({ success: false, message: 'page and sessionId are required' });
      return;
    }

    // SECURITY: Truncate inputs to prevent storing massive strings in DB
    const safePage = String(page).slice(0, 500);
    const safeReferrer = referrer ? String(referrer).slice(0, 1000) : null;
    const safeSessionId = String(sessionId).slice(0, 100);

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
        userId: null, // Never accept userId from unauthenticated request
      },
    });

    res.json({ success: true });
  } catch (error) {
    // Don't let tracking errors break the site — silently fail
    res.json({ success: true });
  }
}

/**
 * GET /api/admin/visitors
 * Get visitor analytics (admin only)
 */
export async function getVisitorStats(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { days = '30' } = req.query;
    const daysNum = Math.min(90, Math.max(1, parseInt(days as string, 10)));

    const since = new Date();
    since.setDate(since.getDate() - daysNum);
    since.setHours(0, 0, 0, 0);

    // Run all queries in parallel
    const [
      totalPageViews,
      uniqueVisitors,
      uniqueSessions,
      topPages,
      deviceBreakdown,
      browserBreakdown,
      recentVisitors,
      dailyVisits,
    ] = await Promise.all([
      // Total page views
      prisma.visitor.count({ where: { createdAt: { gte: since } } }),

      // Unique visitors (by IP)
      prisma.visitor.groupBy({
        by: ['ip'],
        where: { createdAt: { gte: since } },
      }).then((r: any[]) => r.length),

      // Unique sessions
      prisma.visitor.groupBy({
        by: ['sessionId'],
        where: { createdAt: { gte: since } },
      }).then((r: any[]) => r.length),

      // Top pages
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

      // Recent visitors (last 50 unique sessions)
      prisma.$queryRaw`
        SELECT DISTINCT ON ("sessionId")
          "id", "ip", "page", "device", "browser", "os", "sessionId", "userId", "createdAt"
        FROM "Visitor"
        WHERE "createdAt" >= ${since}
        ORDER BY "sessionId", "createdAt" DESC
        LIMIT 50
      `,

      // Daily visit counts for chart
      prisma.$queryRaw`
        SELECT 
          DATE("createdAt") as date,
          COUNT(*)::int as "pageViews",
          COUNT(DISTINCT "ip")::int as "uniqueVisitors",
          COUNT(DISTINCT "sessionId")::int as "sessions"
        FROM "Visitor"
        WHERE "createdAt" >= ${since}
        GROUP BY DATE("createdAt")
        ORDER BY DATE("createdAt") ASC
      `,
    ]);

    // Today's stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayViews = await prisma.visitor.count({ where: { createdAt: { gte: todayStart } } });
    const todayUnique = await prisma.visitor.groupBy({
      by: ['ip'],
      where: { createdAt: { gte: todayStart } },
    }).then((r: any[]) => r.length);

    res.json({
      success: true,
      data: {
        overview: {
          totalPageViews,
          uniqueVisitors,
          uniqueSessions,
          avgPagesPerSession: uniqueSessions > 0 ? Math.round((totalPageViews / uniqueSessions) * 10) / 10 : 0,
        },
        today: {
          pageViews: todayViews,
          uniqueVisitors: todayUnique,
        },
        topPages: topPages.map((p: any) => ({ page: p.page, views: p._count.page })),
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
