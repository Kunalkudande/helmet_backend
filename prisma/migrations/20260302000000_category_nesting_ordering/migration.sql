-- AlterTable: Add groupSortOrder and parentId to ProductCategory
ALTER TABLE "ProductCategory" ADD COLUMN "groupSortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProductCategory" ADD COLUMN "parentId" TEXT;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
