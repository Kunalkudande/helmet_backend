BEGIN;
-- DropForeignKey
ALTER TABLE "AttributeDefinition" DROP CONSTRAINT "AttributeDefinition_productTypeId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_productTypeId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_productId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_variantId_fkey";

-- DropIndex
DROP INDEX "Product_productTypeId_idx";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "inventoryDeducted";

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "variantAttributes",
DROP COLUMN "variantLabel";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "attributeValues",
DROP COLUMN "manufacturerPartNumber",
DROP COLUMN "productTypeId",
DROP COLUMN "reorderLevel",
DROP COLUMN "unitOfMeasure";

-- AlterTable
ALTER TABLE "ProductVariant" DROP COLUMN "attributeValues",
DROP COLUMN "label";
ALTER TABLE "ProductVariant" ALTER COLUMN "size" DROP DEFAULT;
ALTER TABLE "ProductVariant" ALTER COLUMN "size" TYPE "Size" USING "size"::"Size";

-- DropTable
DROP TABLE "AttributeDefinition";

-- DropTable
DROP TABLE "ProductType";

-- DropTable
DROP TABLE "StockMovement";

COMMIT;
