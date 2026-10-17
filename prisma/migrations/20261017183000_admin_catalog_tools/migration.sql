ALTER TABLE "Product" ADD COLUMN "lowStockThreshold" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Product" ADD CONSTRAINT "Product_lowStockThreshold_nonnegative" CHECK ("lowStockThreshold" >= 0);

CREATE TABLE "ProductImportBatch" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductImportBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductImportBatch_expiresAt_idx" ON "ProductImportBatch"("expiresAt");
