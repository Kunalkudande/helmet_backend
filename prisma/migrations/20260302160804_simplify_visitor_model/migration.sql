/*
  Warnings:

  - You are about to drop the column `city` on the `Visitor` table. All the data in the column will be lost.
  - You are about to drop the column `country` on the `Visitor` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Visitor` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[sessionId]` on the table `Visitor` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Visitor_sessionId_idx";

-- AlterTable
ALTER TABLE "Visitor" DROP COLUMN "city",
DROP COLUMN "country",
DROP COLUMN "userId";

-- CreateIndex
CREATE UNIQUE INDEX "Visitor_sessionId_key" ON "Visitor"("sessionId");
