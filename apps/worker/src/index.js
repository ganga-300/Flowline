const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const prisma = require("./prismaClient");
require("dotenv").config();

const connection = new IORedis("redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// Ek helper function — sirf "action" type step ko chalata hai abhi
// (filter/branch/delay/ai baad mein add karenge)
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
    const { zapRunId } = job.data;

    // 1. ZapRun ki details nikalo
    const run = await prisma.zapRun.findUnique({ where: { id: zapRunId } });

    // 2. Us Zap ke saare top-level steps nikalo, order se
    const steps = await prisma.step.findMany({
      where: { zapId: run.zapId, parentStepId: null },
      orderBy: { order: "asc" },
    });

    await prisma.zapRun.update({
      where: { id: zapRunId },
      data: { status: "running", startedAt: new Date() },
    });

    // 3. Har step ko order mein chalao
    for (const step of steps) {
      const stepExecution = await prisma.stepExecution.create({
        data: {
          zapRunId,
          stepId: step.id,
          status: "running",
          startedAt: new Date(),
        },
      });

      try {
        const result = await executeActionStep(step);
        await prisma.stepExecution.update({
          where: { id: stepExecution.id },
          data: { status: "success", output: result.output, completedAt: new Date() },
        });
      } catch (err) {
        await prisma.stepExecution.update({
          where: { id: stepExecution.id },
          data: { status: "failed", error: err.message, completedAt: new Date() },
        });
        await prisma.zapRun.update({
          where: { id: zapRunId },
          data: { status: "failed", completedAt: new Date() },
        });
        return; // yahin ruk jao, aage ke steps mat chalao
      }
    }

    // 4. Saare steps success ho gaye
    await prisma.zapRun.update({
      where: { id: zapRunId },
      data: { status: "success", completedAt: new Date() },
    });
  },
  { connection }
);

console.log("Worker started, listening for jobs...");