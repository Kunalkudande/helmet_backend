import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import visitorRoutes from "../src/routes/visitorRoutes";
import adminRoutes from "../src/routes/adminRoutes";
import { prisma } from "../src/config/database";
import { generateAccessToken } from "../src/utils/jwt";
process.env.JWT_SECRET = "test-visitor-secret-at-least-32-characters";
const admin = generateAccessToken({
  userId: "admin",
  email: "admin@example.test",
  role: "ADMIN",
});
const customer = generateAccessToken({
  userId: "customer",
  email: "customer@example.test",
  role: "CUSTOMER",
});
const id = "11111111-1111-4111-8111-111111111111",
  event = "22222222-2222-4222-8222-222222222222";
const originals: (() => void)[] = [];
function patch(target: any, key: string, value: any) {
  const old = target[key];
  originals.push(() => (target[key] = old));
  target[key] = value;
}
const app = express();
app.use(express.json());
app.use("/api/visitors", visitorRoutes);
app.use("/api/admin", adminRoutes);
app.use((e: any, _req: any, res: any, _next: any) =>
  res.status(e.statusCode || 500).json({ error: e.message }),
);
async function main() {
  let visitor: any = null;
  const views = new Map(),
    events = new Map();
  patch(prisma.user, "findUnique", async () => ({ role: "ADMIN" }));
  patch(prisma.product, "findFirst", async () => ({ id }));
  patch(prisma.visitor, "findUnique", async () => visitor);
  patch(prisma.visitor, "upsert", async ({ create, update }: any) => {
    visitor = visitor ? { ...visitor, ...update } : { id, ...create };
    return visitor;
  });
  patch(prisma.visitorPageView, "upsert", async ({ create, where }: any) => {
    if (!views.has(where.eventKey)) views.set(where.eventKey, create);
    return create;
  });
  patch(prisma.visitorPageView, "create", async ({ data }: any) =>
    views.set(String(views.size), data),
  );
  patch(prisma.visitorEvent, "upsert", async ({ create, where }: any) => {
    if (!events.has(where.eventKey)) events.set(where.eventKey, create);
    return create;
  });
  const post = (body: any) =>
    request(app).post("/api/visitors/track").send(body);
  const payload = {
    page: "/products/coil?email=private",
    sessionId: id,
    eventId: event,
    referrer: "https://google.com/search?q=private",
    source: "test-campaign",
  };
  assert.equal((await post(payload)).status, 200);
  assert.equal(visitor.page, "/products/coil");
  assert.equal(visitor.referrer, "https://google.com");
  await post(payload);
  assert.equal(views.size, 1, "Duplicate page-view event is idempotent");
  await post({
    ...payload,
    page: "/checkout",
    eventId: "33333333-3333-4333-8333-333333333333",
  });
  assert.equal(
    visitor.page,
    "/products/coil",
    "Landing page stays first-touch",
  );
  assert.equal(
    (await post({ ...payload, type: "add_to_cart", productId: id })).status,
    200,
  );
  await post({ ...payload, type: "add_to_cart", productId: id });
  assert.equal(events.size, 1);
  assert.equal(
    (await post({ ...payload, type: "purchase" })).status,
    400,
    "Browser cannot declare a sale",
  );
  assert.equal(
    (await post({ ...payload, page: "/admin/products" })).status,
    400,
  );
  const before = views.size;
  await request(app)
    .post("/api/visitors/track")
    .set("Authorization", "Bearer " + admin)
    .send({ ...payload, eventId: "44444444-4444-4444-8444-444444444444" });
  assert.equal(views.size, before, "Admin browsing excluded");
  for (const url of [
    "/api/admin/visitors",
    "/api/admin/visitors/" + id + "/journey",
  ]) {
    assert.equal((await request(app).get(url)).status, 401);
    assert.equal(
      (
        await request(app)
          .get(url)
          .set("Authorization", "Bearer " + customer)
      ).status,
      403,
    );
  }
  assert.equal(
    (
      await request(app)
        .get("/api/admin/visitors/bad-id/journey")
        .set("Authorization", "Bearer " + admin)
    ).status,
    400,
  );
  patch(prisma.visitorPageView, "findMany", async ({ skip, take }: any) => {
    assert.equal(skip, 100);
    assert.equal(take, 100);
    return [{ id, page: "/checkout", createdAt: new Date() }];
  });
  patch(prisma.visitorPageView, "count", async () => 201);
  const journey = await request(app)
    .get("/api/admin/visitors/" + id + "/journey?page=2")
    .set("Authorization", "Bearer " + admin);
  assert.equal(journey.status, 200);
  assert.equal(journey.body.data.hasNext, true);
  console.log(
    "Visitor ingestion, deduplication, sanitization, admin exclusion, protected journeys and pagination checks passed.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => originals.reverse().forEach((restore) => restore()));
