-- Add geo and network metadata fields for visitor analytics
ALTER TABLE "Visitor"
  ADD COLUMN "country" TEXT,
  ADD COLUMN "countryCode" TEXT,
  ADD COLUMN "region" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "isp" TEXT,
  ADD COLUMN "isProxy" BOOLEAN,
  ADD COLUMN "isHosting" BOOLEAN;

CREATE INDEX "Visitor_country_idx" ON "Visitor"("country");
CREATE INDEX "Visitor_city_idx" ON "Visitor"("city");
