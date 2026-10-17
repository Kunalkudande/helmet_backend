import { Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { AuthRequest } from "../types";
import {
  analyticsWindow,
  BOT_PATTERN,
  percentChange,
  trafficSource,
} from "../utils/visitorAnalytics";

export async function getVisitorJourney(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const visitor = await prisma.visitor.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!visitor) {
      res.status(404).json({ success: false, message: "Session not found" });
      return;
    }
    const page = Math.max(1, Number.parseInt(String(req.query.page), 10) || 1),
      limit = 100;
    const [items, total] = await Promise.all([
      prisma.visitorPageView.findMany({
        where: { visitorId: visitor.id },
        select: { id: true, page: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.visitorPageView.count({ where: { visitorId: visitor.id } }),
    ]);
    res.json({
      success: true,
      data: { items, total, page, hasNext: page * limit < total },
    });
  } catch (error) {
    next(error);
  }
}

export async function getVisitorStats(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const days = Math.min(
      90,
      Math.max(1, Number.parseInt(String(req.query.days), 10) || 30),
    );
    const requestedPage = Math.max(
      1,
      Number.parseInt(String(req.query.page), 10) || 1,
    );
    const limit = Math.min(
      100,
      Math.max(5, Number.parseInt(String(req.query.limit), 10) || 20),
    );
    const includeBots = req.query.includeBots === "true";
    const w = analyticsWindow(days);
    const eligible = Prisma.sql`v."page" !~ '^/(admin|api|login|register|account|reset-password|forgot-password)(/|$)' AND (${includeBots} OR (v."isBot" = false AND COALESCE(v."userAgent", '') !~* ${BOT_PATTERN}))`;
    const period = Prisma.sql`v."createdAt" >= ${w.since} AND v."createdAt" < ${w.until} AND ${eligible}`;
    type Summary = {
      sessions: number;
      uniqueIPs: number;
      views: number;
      carts: number;
      orders: number;
    };
    async function summary(start: Date, end: Date): Promise<Summary> {
      const [s] = await prisma.$queryRaw<Summary[]>(Prisma.sql`
        SELECT COUNT(*)::int AS sessions, COUNT(DISTINCT v.ip)::int AS "uniqueIPs",
        COALESCE(SUM((SELECT COUNT(*) FROM "VisitorPageView" pv WHERE pv."visitorId"=v.id AND pv."createdAt">=${start} AND pv."createdAt"<${end} AND pv.page !~ '^/(admin|api)(/|$)')),0)::int AS views,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "VisitorEvent" e WHERE e."visitorId"=v.id AND e."createdAt">=${start} AND e."createdAt"<${end}))::int AS carts,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Order" o WHERE o."analyticsSessionId"=v."sessionId" AND o."createdAt">=${start} AND o."createdAt"<${end} AND o."orderStatus" NOT IN ('CANCELLED','RETURNED') AND o."paymentStatus" NOT IN ('FAILED','REFUNDED') AND (o."paymentStatus"='PAID' OR o."paymentMethod"='COD')))::int AS orders
        FROM "Visitor" v WHERE v."createdAt">=${start} AND v."createdAt"<${end} AND ${eligible}`);
      return s;
    }
    const [
      current,
      previous,
      today,
      daily,
      landing,
      sources,
      devices,
      browsers,
      countries,
      cities,
      productViews,
      funnel,
      excluded,
    ] = await Promise.all([
      summary(w.since, w.until),
      summary(w.previousSince, w.previousUntil),
      summary(w.today, w.until),
      prisma.$queryRaw<{ date: string; visitors: number; uniqueIPs: number }[]>(
        Prisma.sql`SELECT to_char(v."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS date, COUNT(*)::int AS visitors, COUNT(DISTINCT v.ip)::int AS "uniqueIPs" FROM "Visitor" v WHERE ${period} GROUP BY 1 ORDER BY 1`,
      ),
      prisma.$queryRaw<{ page: string; count: number }[]>(
        Prisma.sql`SELECT v.page,COUNT(*)::int AS count FROM "Visitor" v WHERE ${period} GROUP BY v.page ORDER BY count DESC LIMIT 10`,
      ),
      prisma.$queryRaw<
        {
          referrer: string | null;
          source: string | null;
          medium: string | null;
          campaign: string | null;
          count: number;
        }[]
      >(
        Prisma.sql`SELECT v.referrer,v.source,v.medium,v.campaign,COUNT(*)::int AS count FROM "Visitor" v WHERE ${period} GROUP BY v.referrer,v.source,v.medium,v.campaign`,
      ),
      prisma.$queryRaw<{ device: string; count: number }[]>(
        Prisma.sql`SELECT COALESCE(v.device,'Unknown') AS device,COUNT(*)::int AS count FROM "Visitor" v WHERE ${period} GROUP BY 1 ORDER BY count DESC`,
      ),
      prisma.$queryRaw<{ browser: string; count: number }[]>(
        Prisma.sql`SELECT COALESCE(v.browser,'Unknown') AS browser,COUNT(*)::int AS count FROM "Visitor" v WHERE ${period} GROUP BY 1 ORDER BY count DESC`,
      ),
      prisma.$queryRaw<
        { country: string; countryCode: string | null; count: number }[]
      >(
        Prisma.sql`SELECT v.country,v."countryCode",COUNT(*)::int AS count FROM "Visitor" v WHERE ${period} AND v.country IS NOT NULL GROUP BY 1,2 ORDER BY count DESC LIMIT 10`,
      ),
      prisma.$queryRaw<{ city: string; country: string; count: number }[]>(
        Prisma.sql`SELECT v.city,v.country,COUNT(*)::int AS count FROM "Visitor" v WHERE ${period} AND v.city IS NOT NULL GROUP BY 1,2 ORDER BY count DESC LIMIT 10`,
      ),
      prisma.$queryRaw<
        { slug: string; name: string; views: number; sessions: number }[]
      >(
        Prisma.sql`SELECT p.slug,p.name,COUNT(*)::int AS views,COUNT(DISTINCT v.id)::int AS sessions FROM "VisitorPageView" pv JOIN "Visitor" v ON v.id=pv."visitorId" JOIN "Product" p ON pv.page=('/products/'||p.slug) WHERE ${period} AND pv."createdAt">=${w.since} AND pv."createdAt"<${w.until} GROUP BY p.id,p.slug,p.name ORDER BY views DESC LIMIT 10`,
      ),
      prisma.$queryRaw<
        { product: number; cart: number; checkout: number; orders: number }[]
      >(Prisma.sql`
        WITH steps AS (SELECT v.id,v."sessionId", p.at AS product, c.at AS cart, ch.at AS checkout,
          EXISTS(SELECT 1 FROM "Order" o WHERE o."analyticsSessionId"=v."sessionId" AND o."createdAt">=ch.at AND o."createdAt"<${w.until} AND o."orderStatus" NOT IN ('CANCELLED','RETURNED') AND o."paymentStatus" NOT IN ('FAILED','REFUNDED') AND (o."paymentStatus"='PAID' OR o."paymentMethod"='COD')) AS ordered
          FROM "Visitor" v
          LEFT JOIN LATERAL (SELECT MIN(pv."createdAt") AS at FROM "VisitorPageView" pv JOIN "Product" pr ON pv.page=('/products/'||pr.slug) WHERE pv."visitorId"=v.id AND pv."createdAt">=${w.since} AND pv."createdAt"<${w.until}) p ON true
          LEFT JOIN LATERAL (SELECT MIN(e."createdAt") AS at FROM "VisitorEvent" e WHERE e."visitorId"=v.id AND e."createdAt">=p.at AND e."createdAt"<${w.until}) c ON true
          LEFT JOIN LATERAL (SELECT MIN(pv."createdAt") AS at FROM "VisitorPageView" pv WHERE pv."visitorId"=v.id AND pv.page='/checkout' AND pv."createdAt">=c.at AND pv."createdAt"<${w.until}) ch ON true WHERE ${period})
        SELECT COUNT(product)::int AS product,COUNT(cart)::int AS cart,COUNT(checkout)::int AS checkout,COUNT(*) FILTER(WHERE ordered)::int AS orders FROM steps`),
      prisma.$queryRaw<{ count: number }[]>(
        Prisma.sql`SELECT COUNT(*)::int AS count FROM "Visitor" v WHERE v."createdAt">=${w.since} AND v."createdAt"<${w.until} AND (v."isBot" OR COALESCE(v."userAgent",'') ~* ${BOT_PATTERN})`,
      ),
    ]);
    const totalPages = Math.max(1, Math.ceil(current.sessions / limit));
    const page = Math.min(requestedPage, totalPages);
    const recent = await prisma.$queryRaw<
      any[]
    >(Prisma.sql`SELECT v.id,v.ip,v.page,v.device,v.browser,v.os,v.country,v."countryCode",v.region,v.city,v.isp,v.referrer,v.source,v.medium,v.campaign,(v."isBot" OR COALESCE(v."userAgent",'') ~* ${BOT_PATTERN}) AS "isBot",v."createdAt",v."lastSeenAt",
      (SELECT COUNT(*)::int FROM "VisitorPageView" pv WHERE pv."visitorId"=v.id) AS "pageViewCount"
      FROM "Visitor" v WHERE ${period} ORDER BY v."createdAt" DESC,v.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`);
    const sourceMap = new Map<
      string,
      {
        channel: string;
        source: string;
        medium: string | null;
        campaign: string | null;
        count: number;
      }
    >();
    for (const row of sources) {
      const classified = trafficSource(row.referrer, row.source, row.medium);
      const key = JSON.stringify([classified, row.medium, row.campaign]);
      const existing = sourceMap.get(key);
      if (existing) existing.count += row.count;
      else
        sourceMap.set(key, {
          ...classified,
          medium: row.medium,
          campaign: row.campaign,
          count: row.count,
        });
    }
    res.json({
      success: true,
      data: {
        overview: {
          totalVisitors: current.sessions,
          uniqueIPs: current.uniqueIPs,
          pageViews: current.views,
          cartSessions: current.carts,
          convertedSessions: current.orders,
        },
        today: { visitors: today.sessions, uniqueIPs: today.uniqueIPs },
        comparison: {
          previous,
          sessionsChange: percentChange(current.sessions, previous.sessions),
          viewsChange: percentChange(current.views, previous.views),
        },
        trafficSources: [...sourceMap.values()]
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
        topProducts: productViews,
        funnel: { sessions: current.sessions, ...funnel[0] },
        excludedBots: excluded[0].count,
        includeBots,
        topPages: landing,
        devices,
        browsers,
        topCountries: countries,
        topCities: cities,
        recentVisitors: recent.map((v) => ({
          ...v,
          traffic: trafficSource(v.referrer, v.source, v.medium),
        })),
        visitorsPagination: {
          page,
          limit,
          total: current.sessions,
          totalPages,
          hasPrev: page > 1,
          hasNext: page < totalPages,
        },
        dailyVisits: w.dates.map(
          (date) =>
            daily.find((d) => d.date === date) || {
              date,
              visitors: 0,
              uniqueIPs: 0,
            },
        ),
        period: `${days} days`,
        range: {
          from: w.since.toISOString(),
          to: w.until.toISOString(),
          timezone: "Asia/Kolkata",
        },
        notes:
          "Sessions start within the selected period. IP addresses are not people. Funnel follows product → successful cart add → checkout → paid or COD order in sequence within one session. New cart/order attribution has no historical backfill. Referrers and bot detection are approximate.",
      },
    });
  } catch (error) {
    next(error);
  }
}
