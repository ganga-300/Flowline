-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zapId" TEXT NOT NULL,
    "zapRunId" TEXT NOT NULL,
    "stepId" TEXT,
    "message" TEXT NOT NULL,
    "errorTrace" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alert_userId_idx" ON "Alert"("userId");

-- CreateIndex
CREATE INDEX "Alert_zapId_idx" ON "Alert"("zapId");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_zapId_fkey" FOREIGN KEY ("zapId") REFERENCES "Zap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
