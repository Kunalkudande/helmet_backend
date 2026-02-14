-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "page" TEXT NOT NULL,
    "referrer" TEXT,
    "country" TEXT,
    "city" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visitor_createdAt_idx" ON "Visitor"("createdAt");

-- CreateIndex
CREATE INDEX "Visitor_sessionId_idx" ON "Visitor"("sessionId");

-- CreateIndex
CREATE INDEX "Visitor_ip_idx" ON "Visitor"("ip");
