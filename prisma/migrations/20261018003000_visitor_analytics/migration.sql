ALTER TABLE "Visitor" ADD COLUMN "source" TEXT, ADD COLUMN "medium" TEXT, ADD COLUMN "campaign" TEXT,
  ADD COLUMN "isBot" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Visitor" SET "lastSeenAt" = "createdAt";
ALTER TABLE "VisitorPageView" ADD COLUMN "eventKey" TEXT;
CREATE UNIQUE INDEX "VisitorPageView_eventKey_key" ON "VisitorPageView"("eventKey");
ALTER TABLE "Order" ADD COLUMN "analyticsSessionId" TEXT;
CREATE INDEX "Order_analyticsSessionId_idx" ON "Order"("analyticsSessionId");
CREATE TABLE "VisitorEvent" (
  "id" TEXT NOT NULL, "eventKey" TEXT NOT NULL, "visitorId" TEXT NOT NULL,
  "productId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitorEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisitorEvent_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VisitorEvent_eventKey_key" ON "VisitorEvent"("eventKey");
CREATE INDEX "VisitorEvent_visitorId_createdAt_idx" ON "VisitorEvent"("visitorId", "createdAt");
CREATE INDEX "VisitorEvent_createdAt_idx" ON "VisitorEvent"("createdAt");
