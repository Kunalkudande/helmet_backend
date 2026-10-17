import assert from "node:assert/strict";
import {
  analyticsWindow,
  indiaDate,
  isLikelyBot,
  safePage,
  safeReferrer,
  trafficSource,
  percentChange,
} from "../src/utils/visitorAnalytics";
const now = new Date("2026-10-17T19:00:00Z");
const w = analyticsWindow(7, now);
assert.equal(indiaDate(now), "2026-10-18");
assert.equal(w.since.toISOString(), "2026-10-11T18:30:00.000Z");
assert.equal(w.dates.length, 7);
assert.equal(w.dates[6], "2026-10-18");
assert.equal(
  w.until.getTime() - w.since.getTime(),
  w.previousUntil.getTime() - w.previousSince.getTime(),
);
assert.equal(safePage("/checkout?email=secret@example.test"), "/checkout");
assert.equal(safePage("/products/coil#detail"), "/products/coil");
for (const input of [
  "/admin/products",
  "//evil.test",
  "/reset-password?token=secret",
  "/account",
  "/api/users",
  "https://evil.test",
  "/bad\\path",
])
  assert.equal(safePage(input), null);
assert.equal(
  safeReferrer("https://user:password@google.com/search?q=private"),
  "https://google.com",
);
assert.equal(safeReferrer("javascript:alert(1)"), null);
assert.deepEqual(trafficSource("https://www.google.co.in/search?q=coil"), {
  channel: "Search",
  source: "Google",
});
assert.equal(trafficSource("https://l.instagram.com").channel, "Social");
assert.equal(
  trafficSource("https://bikersbrain.in/cart").channel,
  "Direct / unknown",
);
assert.equal(
  trafficSource(null, "instagram", "paid_social").channel,
  "Paid campaign",
);
assert.equal(trafficSource("https://google.com.evil.test").channel, "Referral");
assert.equal(isLikelyBot("Googlebot"), true);
assert.equal(isLikelyBot("Mozilla/5.0 Chrome/130 Safari/537"), false);
assert.equal(percentChange(15, 10), 50);
assert.equal(percentChange(0, 10), -100);
assert.equal(percentChange(5, 0), null);
console.log(
  "Visitor date boundaries, attribution, sanitization and comparison checks passed.",
);
