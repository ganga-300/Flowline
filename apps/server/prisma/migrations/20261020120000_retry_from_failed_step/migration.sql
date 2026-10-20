-- AlterTable
ALTER TABLE "ZapRun" ADD COLUMN "retryOfRunId" TEXT;

-- AlterTable
ALTER TABLE "StepExecution" ADD COLUMN "reusedFromRunId" TEXT;
