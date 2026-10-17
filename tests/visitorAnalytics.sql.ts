import "dotenv/config";
import assert from "node:assert/strict";
import { analyticsWindow } from "../src/utils/visitorAnalytics";
// Interactive transactions should use the configured direct connection, not transaction pooling.
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
const {
  prisma,
}: typeof import("../src/config/database") = require("../src/config/database");
const {
  getVisitorStats,
}: typeof import("../src/controllers/visitorInsightsController") = require("../src/controllers/visitorInsightsController");

// All fixtures live in connection-local temporary tables. Real store data is untouched.
async function main() {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE "Visitor" (id TEXT,ip TEXT,page TEXT,"userAgent" TEXT,"isBot" BOOLEAN DEFAULT false,"sessionId" TEXT,"createdAt" TIMESTAMP,"lastSeenAt" TIMESTAMP,referrer TEXT,source TEXT,medium TEXT,campaign TEXT,device TEXT,browser TEXT,os TEXT,country TEXT,"countryCode" TEXT,region TEXT,city TEXT,isp TEXT) ON COMMIT DROP`,
      );
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE "VisitorPageView" (id TEXT,"visitorId" TEXT,page TEXT,"createdAt" TIMESTAMP) ON COMMIT DROP`,
      );
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE "VisitorEvent" (id TEXT,"visitorId" TEXT,"createdAt" TIMESTAMP) ON COMMIT DROP`,
      );
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE "Order" ("analyticsSessionId" TEXT,"createdAt" TIMESTAMP,"orderStatus" TEXT,"paymentStatus" TEXT,"paymentMethod" TEXT) ON COMMIT DROP`,
      );
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE "Product" (id TEXT,slug TEXT,name TEXT) ON COMMIT DROP`,
      );
      const w = analyticsWindow(7);
      const base = w.today.getTime() + 1000;
      const at = (seconds: number) => new Date(base + seconds * 1000);
      for (const [id, ip, page, ua, created, referrer] of [
        ["a", "1", "/products/coil", "Chrome", at(0), "https://google.com"],
        ["b", "2", "/", "Googlebot", at(0), null],
        ["c", "3", "/", "Chrome", at(0), null],
        ["e", "4", "/products/coil", "Chrome", at(0), null],
        [
          "prior",
          "5",
          "/",
          "Chrome",
          new Date(w.previousSince.getTime() + 1000),
          null,
        ],
        ["admin", "6", "/admin/products", "Chrome", at(0), null],
      ] as const)
        await tx.$executeRawUnsafe(
          `INSERT INTO "Visitor" (id,ip,page,"userAgent","sessionId","createdAt","lastSeenAt",referrer,device,browser,os) VALUES ($1,$2,$3,$4,$1,$5,$5,$6,'mobile','Chrome','Android')`,
          id,
          ip,
          page,
          ua,
          created,
          referrer,
        );
      await tx.$executeRawUnsafe(
        `INSERT INTO "Product" VALUES ('p','coil','Ignition Coil')`,
      );
      for (const [id, visitor, page, seconds] of [
        ["pv1", "a", "/products/coil", 1],
        ["pv2", "a", "/checkout", 3],
        ["pv3", "c", "/", 1],
        ["pv4", "e", "/products/coil", 11],
        ["pv5", "e", "/checkout", 12],
      ] as const)
        await tx.$executeRawUnsafe(
          `INSERT INTO "VisitorPageView" VALUES ($1,$2,$3,$4)`,
          id,
          visitor,
          page,
          at(seconds),
        );
      await tx.$executeRawUnsafe(
        `INSERT INTO "VisitorEvent" VALUES ('cart1','a',$1),('cart2','e',$2)`,
        at(2),
        at(10),
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "Order" VALUES ('a',$1,'CONFIRMED','PAID','RAZORPAY'),('e',$2,'PENDING','PENDING','COD'),('c',$2,'PENDING','PENDING','RAZORPAY'),('c',$2,'PENDING','FAILED','COD'),('c',$2,'CONFIRMED','REFUNDED','COD'),('c',$2,'CANCELLED','PAID','RAZORPAY')`,
        at(4),
        at(13),
      );
      const original = prisma.$queryRaw;
      const transactionQuery = tx.$queryRaw.bind(tx);
      (prisma as any).$queryRaw = (query: any) => transactionQuery(query);
      try {
        const invoke = async (includeBots = false) => {
          let data: any;
          let failure: any;
          await getVisitorStats(
            { query: { days: "7", includeBots: String(includeBots) } } as any,
            { json: (body: any) => (data = body.data) } as any,
            (e: any) => (failure = e),
          );
          if (failure) throw failure;
          return data;
        };
        const stats = await invoke();
        assert.equal(stats.overview.totalVisitors, 3);
        assert.equal(stats.overview.pageViews, 5);
        assert.equal(stats.overview.uniqueIPs, 3);
        assert.equal(stats.overview.cartSessions, 2);
        assert.equal(
          stats.overview.convertedSessions,
          2,
          "Unpaid online, failed/refunded COD and cancelled orders must not count",
        );
        assert.deepEqual(
          stats.funnel,
          { sessions: 3, product: 2, cart: 1, checkout: 1, orders: 1 },
          "Out-of-order cart event must not advance the funnel",
        );
        assert.equal(stats.dailyVisits.length, 7);
        assert.equal(
          stats.dailyVisits.filter((d: any) => d.visitors === 0).length,
          6,
        );
        assert.equal(stats.comparison.previous.sessions, 1);
        assert.equal(stats.comparison.sessionsChange, 200);
        assert.equal(stats.topProducts[0].views, 2);
        assert.equal(stats.topProducts[0].sessions, 2);
        assert.equal(
          stats.trafficSources.find((s: any) => s.source === "Google").count,
          1,
        );
        assert.equal(stats.excludedBots, 1);
        const withBots = await invoke(true);
        assert.equal(withBots.overview.totalVisitors, 4);
        assert.equal(
          withBots.recentVisitors.find((v: any) => v.id === "b").isBot,
          true,
        );
      } finally {
        (prisma as any).$queryRaw = original;
      }
    },
    { timeout: 90000 },
  );
  console.log(
    "PostgreSQL analytics aggregates, ordered funnel, payment exclusions, bot filters, comparisons and zero-filled India-time dates passed with temporary fixtures.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
