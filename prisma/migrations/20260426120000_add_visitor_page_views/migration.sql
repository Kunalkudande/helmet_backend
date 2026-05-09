-- Create a page-view history table so each session can store all visited pages.
CREATE TABLE "VisitorPageView" (
  "id" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "page" TEXT NOT NULL,
  "referrer" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitorPageView_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VisitorPageView"
  ADD CONSTRAINT "VisitorPageView_visitorId_fkey"
  FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "VisitorPageView_visitorId_createdAt_idx" ON "VisitorPageView"("visitorId", "createdAt");
CREATE INDEX "VisitorPageView_page_idx" ON "VisitorPageView"("page");

-- Backfill existing visitor landing pages into the new history table.
INSERT INTO "VisitorPageView" ("id", "visitorId", "page", "referrer", "createdAt")
SELECT
  'backfill-' || v."id",
  v."id",
  v."page",
  v."referrer",
  v."createdAt"
FROM "Visitor" v;
