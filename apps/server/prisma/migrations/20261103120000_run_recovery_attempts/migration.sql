-- AlterTable
-- Recovery sweep attempts per run (worker/src/runRecovery.js). Existing runs start at 0.
-- A constant default makes this a metadata-only change on Postgres 11+ (no table rewrite).
ALTER TABLE "ZapRun" ADD COLUMN "recoveryAttempts" INTEGER NOT NULL DEFAULT 0;
