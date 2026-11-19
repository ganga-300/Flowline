-- Runs that start (or resume after a Delay) after their Zap was turned off are cancelled.
ALTER TYPE "RunStatus" ADD VALUE 'CANCELLED';

-- Connection health: the worker marks an account "NEEDS_RECONNECT" when the app rejects its
-- token; reconnecting sets it back to "OK". externalId: the app's stable id for the account
-- (Slack team id), so a renamed workspace is still recognised on reconnect.
ALTER TABLE "Connection" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'OK';
ALTER TABLE "Connection" ADD COLUMN "lastError" TEXT;
ALTER TABLE "Connection" ADD COLUMN "lastErrorAt" TIMESTAMP(3);
ALTER TABLE "Connection" ADD COLUMN "externalId" TEXT;
