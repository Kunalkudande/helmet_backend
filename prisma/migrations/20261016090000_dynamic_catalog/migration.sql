-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "attributeValues" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "manufacturerPartNumber" TEXT,
ADD COLUMN     "productTypeId" TEXT,
ADD COLUMN     "reorderLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unitOfMeasure" TEXT NOT NULL DEFAULT 'piece';

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "attributeValues" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "label" TEXT;
ALTER TABLE "ProductVariant" ALTER COLUMN "size" TYPE TEXT USING "size"::text;
ALTER TABLE "ProductVariant" ALTER COLUMN "size" SET DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "inventoryDeducted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "variantAttributes" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "variantLabel" TEXT;

-- CreateTable
CREATE TABLE "AttributeDefinition" (
    "id" TEXT NOT NULL,
    "productTypeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'PRODUCT',
    "unit" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "min" DECIMAL(18,6),
    "max" DECIMAL(18,6),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "actorId" TEXT,
    "operationKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttributeDefinition_productTypeId_key_key" ON "AttributeDefinition"("productTypeId" ASC, "key" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProductType_name_key" ON "ProductType"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_operationKey_key" ON "StockMovement"("operationKey" ASC);

-- CreateIndex
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Product_productTypeId_idx" ON "Product"("productTypeId" ASC);

-- AddForeignKey
ALTER TABLE "AttributeDefinition" ADD CONSTRAINT "AttributeDefinition_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "ProductType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "ProductType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
