require("dotenv").config();
const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const prisma = require("./prismaClient");

const connection = new IORedis("redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeActionStep(step) {
  const { url, method = "POST", body = {} } = step.config;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  const output = await res.json().catch(() => ({}));
  return { status: res.status, output };
}

// Retry wrapper: fail hone par max 3 baar try karta hai, har baar
// wait time double karke (exponential backoff: 500ms, 1000ms, 2000ms).
async function executeWithRetry(step, stepExecutionId) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await executeActionStep(step);
    } catch (err) {
      lastError = err;
      console.log(`[worker] step ${step.id} attempt ${attempt} failed: ${err.message}`);

      await prisma.stepExecution.update({
        where: { id: stepExecutionId },
        data: { attempt, status: "RETRYING", error: err.message },
      });

      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  }

  throw lastError; // saare attempts fail ho gaye
}

const worker = new Worker(
  "zap-execution",
  async (job) => {
    console.log(`[worker] picked up job ${job.id}`, job.data);
    const { zapRunId } = job.data;

    const run = await prisma.zapRun.findUnique({ where: { id: zapRunId } });
    const steps = await prisma.step.findMany({
      where: { zapId: run.zapId, parentStepId: null },
      orderBy: { order: "asc" },
    });

    await prisma.zapRun.update({
      where: { id: zapRunId },
      data: { status: "RUNNING" },
    });

    for (const step of steps) {
      const stepExecution = await prisma.stepExecution.create({
        data: { zapRunId, stepId: step.id, status: "RUNNING" },
      });

      try {
        const result = await executeWithRetry(step, stepExecution.id);
        await prisma.stepExecution.update({
          where: { id: stepExecution.id },
          data: { status: "SUCCESS", output: result.output },
        });
      } catch (err) {
        console.error(`[worker] step ${step.id} permanently failed:`, err.message);
        await prisma.stepExecution.update({
          where: { id: stepExecution.id },
          data: { status: "FAILED", error: err.message },
        });
        await prisma.zapRun.update({
          where: { id: zapRunId },
          data: { status: "FAILED" },
        });
        return;
      }
    }

    await prisma.zapRun.update({
      where: { id: zapRunId },
      data: { status: "SUCCESS" },
    });
    console.log(`[worker] job ${job.id} completed`);
  },
  { connection }
);

worker.on("error", (err) => console.error("[worker] connection error:", err));

console.log("Worker started, listening for jobs...");