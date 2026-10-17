export const BOT_PATTERN =
  "bot|crawler|spider|headless|lighthouse|pagespeed|facebookexternalhit|preview|slurp|bingpreview";
export const isLikelyBot = (ua: string) =>
  new RegExp(BOT_PATTERN, "i").test(ua);
export function analyticsSessionId(value: unknown): string | null {
  return typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
    ? value
    : null;
}
export function safePage(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.length > 500
  )
    return null;
  const path = value.split(/[?#]/)[0];
  if (
    /[\\\s\u0000-\u001f]/.test(path) ||
    /^\/(admin|api|login|register|forgot-password|reset-password|account|track-order|order-success)(\/|$)/.test(
      path,
    )
  )
    return null;
  return path;
}
export function safeReferrer(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    return /^https?:$/.test(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}
export function campaignText(value: unknown): string | null {
  return typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f<>]/g, "")
        .trim()
        .slice(0, 100) || null
    : null;
}
export function trafficSource(
  referrer: string | null,
  source?: string | null,
  medium?: string | null,
) {
  if (source)
    return {
      channel: /^(cpc|ppc|paid|paid_social|display)$/i.test(medium || "")
        ? "Paid campaign"
        : "Campaign",
      source,
    };
  let host = "";
  try {
    host = new URL(referrer || "").hostname.replace(/^www\./, "");
  } catch {
    /* direct */
  }
  if (!host || /(^|\.)bikersbrain\.in$/.test(host))
    return { channel: "Direct / unknown", source: "Direct / unknown" };
  if (
    /(^|\.)(google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})|bing\.com|duckduckgo\.com|search\.yahoo\.com)$/.test(
      host,
    )
  )
    return {
      channel: "Search",
      source: host.includes("google.") ? "Google" : host,
    };
  if (
    /(^|\.)(facebook\.com|instagram\.com|t\.co|twitter\.com|x\.com|youtube\.com|pinterest\.com|linkedin\.com)$/.test(
      host,
    )
  )
    return { channel: "Social", source: host };
  return { channel: "Referral", source: host };
}
const DAY = 86400000,
  IST = 19800000;
export const indiaDate = (date: Date) =>
  new Date(date.getTime() + IST).toISOString().slice(0, 10);
export function analyticsWindow(days: number, now = new Date()) {
  const today = new Date(indiaDate(now) + "T00:00:00+05:30");
  const since = new Date(today.getTime() - (days - 1) * DAY);
  // Compare equal elapsed windows, including today's partial day.
  const previousSince = new Date(since.getTime() - days * DAY);
  const previousUntil = new Date(now.getTime() - days * DAY);
  const dates = Array.from({ length: days }, (_, i) =>
    indiaDate(new Date(since.getTime() + i * DAY)),
  );
  return { since, until: now, today, previousSince, previousUntil, dates };
}
export function percentChange(
  current: number,
  previous: number,
): number | null {
  return previous
    ? Math.round(((current - previous) / previous) * 1000) / 10
    : null;
}
