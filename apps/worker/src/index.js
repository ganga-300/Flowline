require("dotenv").config();
const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const prisma = require("./prismaClient");

const connection = new IORedis("redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

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
      data: { status: "RUNNING"},
    });

    for (const step of steps) {
      const stepExecution = await prisma.stepExecution.create({
        data: {
          zapRunId,
          stepId: step.id,
          status: "RUNNING",
          
        },
      });

      try {
        const result = await executeActionStep(step);
        await prisma.stepExecution.update({
          where: { id: stepExecution.id },
          data: { status: "SUCCESS", output: result.output },
        });
      } catch (err) {
        console.error(`[worker] step ${step.id} failed:`, err.message);
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
worker.on("failed", (job, err) => console.error(`[worker] job ${job?.id} failed:`, err.message));

console.log("Worker started, listening for jobs...");
