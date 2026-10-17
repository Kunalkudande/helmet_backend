import { Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../types";

interface GeoLookup {
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  isp: string | null;
  isProxy: boolean | null;
  isHosting: boolean | null;
}

const GEO_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const geoCache = new Map<
  string,
  { data: GeoLookup | null; expiresAt: number }
>();

function normalizeIp(raw: string): string {
  const first = raw.split(",")[0]?.trim() || raw;
  if (first.startsWith("::ffff:")) return first.slice(7);
  return first;
}

function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === "::1" || ip === "127.0.0.1" || ip === "localhost") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd"))
    return true;
  return false;
}

async function lookupGeoFromIp(ip: string): Promise<GeoLookup | null> {
  if (!ip || ip === "unknown" || isPrivateOrLocalIp(ip)) {
    return null;
  }

  const cached = geoCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);

    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,timezone,isp,proxy,hosting`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!response.ok) {
      geoCache.set(ip, {
        data: null,
        expiresAt: Date.now() + GEO_CACHE_TTL_MS,
      });
      return null;
    }

    const payload = (await response.json()) as {
      status?: string;
      country?: string;
      countryCode?: string;
      regionName?: string;
      city?: string;
      timezone?: string;
      isp?: string;
      proxy?: boolean;
      hosting?: boolean;
    };

    if (payload.status !== "success") {
      geoCache.set(ip, {
        data: null,
        expiresAt: Date.now() + GEO_CACHE_TTL_MS,
      });
      return null;
    }

    const result: GeoLookup = {
      country: payload.country || null,
      countryCode: payload.countryCode || null,
      region: payload.regionName || null,
      city: payload.city || null,
      timezone: payload.timezone || null,
      isp: payload.isp || null,
      isProxy: typeof payload.proxy === "boolean" ? payload.proxy : null,
      isHosting: typeof payload.hosting === "boolean" ? payload.hosting : null,
    };

    geoCache.set(ip, {
      data: result,
      expiresAt: Date.now() + GEO_CACHE_TTL_MS,
    });
    return result;
  } catch {
    geoCache.set(ip, { data: null, expiresAt: Date.now() + GEO_CACHE_TTL_MS });
    return null;
  }
}

/**
 * Extract device, browser, and OS from a user-agent string.
 */
function parseUserAgent(ua: string = ""): {
  device: string;
  browser: string;
  os: string;
} {
  const lower = ua.toLowerCase();

  // Device
  let device = "desktop";
  if (/mobile|android.*mobile|iphone|ipod/.test(lower)) device = "mobile";
  else if (/tablet|ipad|android(?!.*mobile)/.test(lower)) device = "tablet";

  // Browser (order matters — Edge contains "chrome", so check it first)
  let browser = "Other";
  if (lower.includes("edg/")) browser = "Edge";
  else if (lower.includes("opr/") || lower.includes("opera")) browser = "Opera";
  else if (lower.includes("chrome") && !lower.includes("chromium"))
    browser = "Chrome";
  else if (lower.includes("firefox")) browser = "Firefox";
  else if (lower.includes("safari") && !lower.includes("chrome"))
    browser = "Safari";

  // OS
  let os = "Other";
  if (lower.includes("windows")) os = "Windows";
  else if (lower.includes("mac os") || lower.includes("macintosh"))
    os = "macOS";
  else if (lower.includes("android")) os = "Android";
  else if (/iphone|ipad|ipod/.test(lower)) os = "iOS";
  else if (lower.includes("linux")) os = "Linux";

  return { device, browser, os };
}

/** Best-effort analytics: never blocks shopping or checkout. */
export async function trackVisit(
  req: AuthRequest,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  try {
    const {
      safePage,
      safeReferrer,
      campaignText,
      isLikelyBot,
      analyticsSessionId,
    } = await import("../utils/visitorAnalytics");
    if (req.user?.role === "ADMIN") {
      res.json({ success: true, excluded: true });
      return;
    }
    const {
      page,
      sessionId,
      referrer,
      eventId,
      type = "page_view",
      productId,
      source,
      medium,
      campaign,
    } = req.body;
    const path = safePage(page);
    if (
      !path ||
      typeof sessionId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(sessionId) ||
      !["page_view", "add_to_cart"].includes(type) ||
      (eventId !== undefined && !analyticsSessionId(eventId))
    ) {
      res
        .status(400)
        .json({ success: false, message: "Invalid tracking event" });
      return;
    }
    if (
      type === "add_to_cart" &&
      (!analyticsSessionId(productId) || !eventId)
    ) {
      res
        .status(400)
        .json({ success: false, message: "Invalid product event" });
      return;
    }
    if (
      type === "add_to_cart" &&
      !(await prisma.product.findFirst({
        where: { id: productId, isActive: true },
        select: { id: true },
      }))
    ) {
      res.status(400).json({ success: false, message: "Unknown product" });
      return;
    }
    const existing = await prisma.visitor.findUnique({
      where: { sessionId },
      select: { id: true },
    });
    const ua = (req.headers["user-agent"] || "").slice(0, 500);
    const ip = normalizeIp(req.ip || req.socket.remoteAddress || "unknown");
    const geo = existing ? null : await lookupGeoFromIp(ip);
    const userAgentInfo = parseUserAgent(ua);
    const now = new Date();
    const visitor = await prisma.visitor.upsert({
      where: { sessionId },
      update: { lastSeenAt: now },
      create: {
        sessionId,
        ip,
        page: path,
        referrer: safeReferrer(referrer),
        userAgent: ua,
        ...userAgentInfo,
        country: geo?.country || null,
        countryCode: geo?.countryCode || null,
        region: geo?.region || null,
        city: geo?.city || null,
        timezone: geo?.timezone || null,
        isp: geo?.isp || null,
        isProxy: geo?.isProxy ?? null,
        isHosting: geo?.isHosting ?? null,
        isBot: isLikelyBot(ua),
        source: campaignText(source),
        medium: campaignText(medium),
        campaign: campaignText(campaign),
        lastSeenAt: now,
      },
    });
    if (type === "add_to_cart") {
      await prisma.visitorEvent.upsert({
        where: { eventKey: eventId },
        update: {},
        create: { eventKey: eventId, visitorId: visitor.id, productId },
      });
    } else if (eventId) {
      await prisma.visitorPageView.upsert({
        where: { eventKey: eventId },
        update: {},
        create: {
          eventKey: eventId,
          visitorId: visitor.id,
          page: path,
          referrer: safeReferrer(referrer),
        },
      });
    } else {
      await prisma.visitorPageView.create({
        data: {
          visitorId: visitor.id,
          page: path,
          referrer: safeReferrer(referrer),
        },
      });
    }
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
}
