-- Indexes for the runs list (newest first per Zap), the recovery sweep's QUEUED/RUNNING
-- lookups, the alerts list (newest first per user) and connections per user.
-- New indexes are created before the ones they replace are dropped.

-- CreateIndex
CREATE INDEX "ZapRun_zapId_createdAt_idx" ON "ZapRun"("zapId", "createdAt");

-- CreateIndex
CREATE INDEX "ZapRun_status_idx" ON "ZapRun"("status");

-- CreateIndex
CREATE INDEX "Alert_userId_createdAt_idx" ON "Alert"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Connection_userId_idx" ON "Connection"("userId");

-- DropIndex (covered by ZapRun_zapId_createdAt_idx)
DROP INDEX "ZapRun_zapId_idx";

-- DropIndex (covered by Alert_userId_createdAt_idx)
DROP INDEX "Alert_userId_idx";
