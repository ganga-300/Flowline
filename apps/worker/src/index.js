require("dotenv").config();
const { Worker ,Queue } = require("bullmq");
const IORedis = require("ioredis");
const prisma = require("./prismaClient");
const { evaluateCondition, resolveTemplate } = require("./conditions");
const { executeFormatterStep } = require("./formatter");
const TokenBucket = require("./rateLimiter");
const { getIntegrationHandler } = require("./integrations/registry");
const { recordStepOutput, restoreStepOutputs } = require("./stepContext");
const { runWithRetry, retryableError, planRecovery, planRetryCarryOver } = require("./recovery");
const { requeueQueuedRuns } = require("./runQueue");
const { aiPromptTemplate } = require("./aiStep");
const { executeHttpRequest } = require("./integrations/http/request");
const { startPollingScheduler, stopPollingScheduler, waitForPollingCycle } = require("./pollingCron");

const slackBucket = new TokenBucket(5, 1); // 5 tokens capacity, 1 token/second refill
const connection = new IORedis("redis://localhost:6380", {
  maxRetriesPerRequest: null,
});


const zapExecutionQueue = new Queue("zap-execution", { connection });

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeActionStep(step, context) {
  const provider = step.config?.provider;
  const action = step.config?.action;

  if (provider && action) {
    const handler = getIntegrationHandler(provider, action);
    if (!handler) {
      throw new Error(`No worker integration handler registered for ${provider}:${action}`);
    }
    return await handler(step, context);
  }

  // Custom HTTP request step (no provider): templating, status checks and SSRF guard
  // live in integrations/http/request.js (shared with the builder's Test button).
  await slackBucket.consume();
  return executeHttpRequest(step.config || {}, context);
}

async function executeAiStep(step) {
  const { model = "meta-llama/llama-3.1-8b-instruct:free" } = step.config;
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("AI step needs OPENROUTER_API_KEY in the worker's environment.");
  }

  const prompt = resolveTemplate(step._context, aiPromptTemplate(step.config));

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw retryableError(`AI step failed: ${res.status} ${errText}`, res.status);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return { output: { content } };
}

// Retry wrapper - used for ACTION / AI steps that call external services.
// Only failures where the provider certainly did not act (rate limits, 502/503/504,
// connection never established) are retried - see recovery.js. Anything else could
// already have sent the message/email/issue, so retrying would create a duplicate.
// Status is RUNNING while a request is in flight and RETRYING while waiting to retry;
// crash recovery relies on that distinction.
async function executeWithRetry(step, stepExecutionId, context) {
  return runWithRetry(
    async () => {
      if (step.type === "AI") {
        return await executeAiStep({ ...step, _context: context });
      }
      if (step.type === "FORMATTER") {
        return executeFormatterStep(step, context);
      }
      return await executeActionStep(step, context);
    },
    {
      attempts: MAX_ATTEMPTS,
      baseDelayMs: BASE_BACKOFF_MS,
      onAttemptStart: async (attempt) => {
        if (attempt > 1) {
          await prisma.stepExecution.update({
            where: { id: stepExecutionId },
            data: { attempt, status: "RUNNING" },
          });
        }
      },
      onAttemptFailed: async (attempt, err, willRetry) => {
        console.log(`[worker] step ${step.id} attempt ${attempt} failed${willRetry ? " (will retry)" : ""}: ${err.message}`);
        if (willRetry) {
          await prisma.stepExecution.update({
            where: { id: stepExecutionId },
            data: { attempt, status: "RETRYING", error: err.message },
          });
        }
      },
    }
  );
}

// Recursively marks a whole unselected branch subtree as SKIPPED - not
// FAILED. This is the distinction from FR-05: a branch not taken is
// expected behavior, not an error.
async function markSkipped(step, allSteps, zapRunId) {
  await prisma.stepExecution.create({
    data: { zapRunId, stepId: step.id, status: "SKIPPED" },
  });
  const children = allSteps.filter((s) => s.parentStepId === step.id);
  for (const child of children) {
    await markSkipped(child, allSteps, zapRunId);
  }
}

// Executes an ordered list of sibling steps against the shared context.
// Returns { filtered: true } if a filter stopped the run, or { done: true }
// when the whole list completed normally.
async function executeStepList(steps, allSteps, context, zapRunId , resumeAfterStepId, completedStepIds = new Set()) {
  let resuming = !!resumeAfterStepId; // true agar resume ho raha hai, warna false
  for (const step of steps) {
    if (resuming) {
      if (step.id === resumeAfterStepId) {
        resuming = false; // yehi wo delay step tha - isse aage se normal chalna shuru karo
      }
      continue; // is step ko skip karo (already ho chuka hai pehle)
    }
    // Already succeeded before a worker crash: don't run it (or send it) again.
    if (completedStepIds.has(step.id)) {
      continue;
    }
    if (step.type === "DELAY") {
      const seconds = step.config.seconds || 60;
      await prisma.stepExecution.create({
        data: {
          zapRunId,
          stepId: step.id,
          status: "SUCCESS",
          output: { delayedSeconds: seconds },
        },
      });
      return { paused: { resumeAfterStepId: step.id, delayMs: seconds * 1000 } };
}
    if (step.type === "FILTER") {
      const passed = evaluateCondition(context, step.config.condition);
      await prisma.stepExecution.create({
        data: {
          zapRunId,
          stepId: step.id,
          status: "SUCCESS",
          output: { passed },
        },
      });
      if (!passed) {
        console.log(`[worker] filter step ${step.id} did not pass - stopping run cleanly`);
        return { filtered: true };
      }
      continue;
    }

    if (step.type === "BRANCH") {
      const children = allSteps
        .filter((s) => s.parentStepId === step.id)
        .sort((a, b) => a.order - b.order);

      // First child whose condition matches wins. A child with no
      // branchCondition acts as the "else"/default path.
      const conditionalChildren = children.filter((c) => c.branchCondition);
      const defaultChild = children.find((c) => !c.branchCondition);
      let selected = null;
      for (const child of conditionalChildren) {
        if (evaluateCondition(context, child.branchCondition)) {
          selected = child;
          break;
        }
      }
      if (!selected) selected = defaultChild;

      for (const child of children) {
        if (!selected || child.id !== selected.id) {
          await markSkipped(child, allSteps, zapRunId);
        }
      }

      await prisma.stepExecution.create({
        data: {
          zapRunId,
          stepId: step.id,
          status: "SUCCESS",
          output: { selectedStepId: selected ? selected.id : null },
        },
      });

      if (!selected) return { done: true }; // no branch matched, nothing further to run

      // Continue into the selected child (and its own children, if any)
      const result = await executeStepList([selected], allSteps, context, zapRunId, undefined, completedStepIds);
      if (result.filtered) return result;
      continue;
    }

    if (step.type === "LOOP") {
      const { resolvePath } = require("./conditions");
      const arrayPath = step.config?.arrayPath || "trigger.items";
      const rawArray = resolvePath(context, arrayPath);
      const items = Array.isArray(rawArray) ? rawArray : (rawArray != null ? [rawArray] : []);

      const children = allSteps
        .filter((s) => s.parentStepId === step.id)
        .sort((a, b) => a.order - b.order);

      const loopResults = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const loopContext = {
          ...context,
          loopItem: item,
          loopIndex: i,
        };

        if (children.length > 0) {
          await executeStepList(children, allSteps, loopContext, zapRunId, undefined, completedStepIds);
        }
        loopResults.push({ index: i, item });
      }

      await prisma.stepExecution.create({
        data: {
          zapRunId,
          stepId: step.id,
          status: "SUCCESS",
          output: { iteratedCount: items.length, items: loopResults },
        },
      });

      continue;
    }

    // ACTION step (AI/transform would slot in here later the same way)
    const stepExecution = await prisma.stepExecution.create({
      data: { zapRunId, stepId: step.id, status: "RUNNING" },
    });

    try {
      const result = await executeWithRetry(step, stepExecution.id,context);
      await prisma.stepExecution.update({
        where: { id: stepExecution.id },
        data: { status: "SUCCESS", output: result.output },
      });
      recordStepOutput(context, step, result.output);
    } catch (err) {
      console.error(`[worker] step ${step.id} permanently failed:`, err.message);
      await prisma.stepExecution.update({
        where: { id: stepExecution.id },
        data: { status: "FAILED", error: err.message },
      });
      throw err; // bubble up - the whole run fails
    }

    // A step can itself have children (e.g. steps nested under a branch
    // child) - continue into them after this step completes.
    const nextChildren = allSteps
      .filter((s) => s.parentStepId === step.id)
      .sort((a, b) => a.order - b.order);
    if (nextChildren.length) {
      const result = await executeStepList(nextChildren, allSteps, context, zapRunId, undefined, completedStepIds);
      if (result.filtered) return result;
    }
  }

  return { done: true };
}

const worker = new Worker(
  "zap-execution",
  async (job) => {
    console.log(`[worker] picked up job ${job.id}`, job.data);
    const { zapRunId , resumeAfterStepId } = job.data;

    const run = await prisma.zapRun.findUnique({ where: { id: zapRunId } });
    if (!run) {
      console.warn(`[worker] run ${zapRunId} not found, skipping job ${job.id}`);
      return;
    }
    // BullMQ can hand out a job again after a crash; a finished run must never run twice.
    if (["SUCCESS", "FAILED", "FILTERED"].includes(run.status)) {
      console.log(`[worker] run ${zapRunId} already ${run.status}, skipping duplicate job ${job.id}`);
      return;
    }
    const allSteps = await prisma.step.findMany({ where: { zapId: run.zapId } });
    const topLevel = allSteps
      .filter((s) => !s.parentStepId)
      .sort((a, b) => a.order - b.order);

    const context = { trigger: run.triggerPayload || {}, steps: {} };

    // "Retry from failed step": on the first pass, copy the original run's successful steps
    // into this run so they are skipped (and their outputs reused) instead of sent again.
    // One createMany = all or nothing; after a crash the rows exist and this is skipped.
    if (run.retryOfRunId && (await prisma.stepExecution.count({ where: { zapRunId } })) === 0) {
      const originalExecutions = await prisma.stepExecution.findMany({
        where: { zapRunId: run.retryOfRunId },
        orderBy: { createdAt: "asc" },
      });
      const rows = planRetryCarryOver(allSteps, originalExecutions, run.retryOfRunId);
      if (rows.length > 0) {
        await prisma.stepExecution.createMany({ data: rows.map((r) => ({ ...r, zapRunId })) });
      }
    }

    // Earlier attempts of this run (a Delay resume, a re-run after a worker crash, or
    // steps reused by "Retry from failed step").
    const priorExecutions = await prisma.stepExecution.findMany({ where: { zapRunId } });
    const recovery = planRecovery(allSteps, priorExecutions);
    restoreStepOutputs(context, priorExecutions.filter((e) => e.status === "SUCCESS"), allSteps);

    await prisma.zapRun.update({
      where: { id: zapRunId },
      data: { status: "RUNNING", ...(!run.startedAt && { startedAt: new Date() }) },
    });

    try {
      // A step that was mid-request when the worker died may or may not have reached the
      // provider. Don't re-send it (that could duplicate a message/email/issue): fail it
      // clearly so the user can check and use "Retry run" if needed.
      if (recovery.interrupted.length > 0) {
        for (const execution of recovery.interrupted) {
          await prisma.stepExecution.update({
            where: { id: execution.id },
            data: {
              status: "FAILED",
              error: "Flowline stopped while this step was sending its request, so it can't tell whether the app received it. It was not re-sent automatically to avoid a duplicate - check the app and use Retry run if needed.",
            },
          });
        }
        throw new Error("A step's outcome is unknown after a worker restart; not re-sent to avoid a duplicate.");
      }
      // Steps that were only waiting to retry (nothing was sent) run again.
      for (const execution of recovery.superseded) {
        await prisma.stepExecution.update({
          where: { id: execution.id },
          data: { status: "FAILED", error: "Interrupted by a worker restart while waiting to retry; ran again." },
        });
      }

      const result = await executeStepList(topLevel, allSteps, context, zapRunId, resumeAfterStepId, recovery.completedStepIds);

      if (result.paused) {
        await zapExecutionQueue.add(
          "resume-zap-run",
          { zapRunId, resumeAfterStepId: result.paused.resumeAfterStepId },
          // Fixed jobId: if this job is re-run after a crash, the resume isn't queued twice.
          { delay: result.paused.delayMs, jobId: `zap-run-${zapRunId}-after-${result.paused.resumeAfterStepId}` }
        );
        return; // run stays RUNNING in the database until the resume completes
      }

      const finalStatus = result.filtered ? "FILTERED" : "SUCCESS";
      await prisma.zapRun.update({
        where: { id: zapRunId },
        data: { status: finalStatus, completedAt: new Date() },
      });
      console.log(`[worker] job ${job.id} completed with status ${finalStatus}`);
    } catch (err) {
      await prisma.zapRun.update({
        where: { id: zapRunId },
        data: { status: "FAILED", completedAt: new Date() },
      });
      console.error(`[worker] job ${job.id} failed:`, err.message);

      try {
        const zap = await prisma.zap.findUnique({ where: { id: run.zapId } });
        if (zap) {
          await prisma.alert.create({
            data: {
              userId: zap.userId,
              zapId: zap.id,
              zapRunId,
              message: `Zap "${zap.zapName}" failed during execution: ${err.message}`,
              errorTrace: err.stack || err.message,
            },
          });
          console.log(`[worker] Created failure Alert for user ${zap.userId}`);
        }
      } catch (alertErr) {
        console.error(`[worker] Failed to create alert:`, alertErr.message);
      }
    }
  },
  // maxStalledCount: how many times a job may be recovered after a worker crash before
  // BullMQ gives up on it (default 1); crash recovery itself is handled above.
  { connection, maxStalledCount: 3 }
);

worker.on("error", (err) => console.error("[worker] connection error:", err));

console.log("Worker started, listening for jobs...");

// Runs created but never queued (e.g. a crash between saving the run and queueing it) are
// queued now. Job ids are per run, so runs that already have a job are not queued twice.
requeueQueuedRuns(prisma, zapExecutionQueue)
  .then((n) => n && console.log(`[worker] re-queued ${n} waiting run(s) on startup`))
  .catch((err) => console.error("[worker] startup re-queue failed:", err.message));

// Automatically start background polling engine alongside the worker
startPollingScheduler();

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15000;
const MIN_SHUTDOWN_TIMEOUT_MS = 1000;

function resolveShutdownTimeout(customTimeoutMs) {
  const raw = customTimeoutMs !== undefined
    ? customTimeoutMs
    : process.env.WORKER_SHUTDOWN_TIMEOUT_MS;

  if (raw === undefined || raw === null) return DEFAULT_SHUTDOWN_TIMEOUT_MS;
  if (typeof raw === "string" && raw.trim() === "") return DEFAULT_SHUTDOWN_TIMEOUT_MS;

  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(parsed) && parsed >= MIN_SHUTDOWN_TIMEOUT_MS) {
    return parsed;
  }
  return DEFAULT_SHUTDOWN_TIMEOUT_MS;
}

let isShuttingDown = false;
let shutdownWatchdog = null;

async function handleShutdown(signal) {
  if (isShuttingDown) {
    console.log(`[worker] Shutdown already in progress, ignoring duplicate ${signal}`);
    return;
  }
  isShuttingDown = true;
  console.log(`[worker] Received ${signal}, starting graceful shutdown...`);

  // Start bounded shutdown watchdog
  const timeoutMs = resolveShutdownTimeout();
  shutdownWatchdog = setTimeout(() => {
    console.error(`[worker] Shutdown watchdog timeout reached (${timeoutMs}ms). Forcing exit.`);
    process.exit(1);
  }, timeoutMs);
  if (shutdownWatchdog.unref) shutdownWatchdog.unref();

  let hasError = false;

  // 1. Stop background polling scheduler
  try {
    stopPollingScheduler();
  } catch (err) {
    hasError = true;
    console.error("[worker] Error stopping polling scheduler:", err.message);
  }

  // 2. Await in-flight polling cycle (if any) before closing connections
  try {
    console.log("[worker] Awaiting active polling cycle (if any)...");
    await waitForPollingCycle();
    console.log("[worker] Polling cycle settled.");
  } catch (err) {
    hasError = true;
    console.error("[worker] Error waiting for polling cycle to settle:", err.message);
  }

  // 3. Close BullMQ worker (waits for active in-flight jobs to complete)
  try {
    console.log("[worker] Closing BullMQ worker...");
    await worker.close();
    console.log("[worker] BullMQ worker closed.");
  } catch (err) {
    hasError = true;
    console.error("[worker] Error closing BullMQ worker:", err.message);
  }

  // 4. Close BullMQ queue
  try {
    console.log("[worker] Closing BullMQ queue...");
    await zapExecutionQueue.close();
    console.log("[worker] BullMQ queue closed.");
  } catch (err) {
    hasError = true;
    console.error("[worker] Error closing BullMQ queue:", err.message);
  }

  // 5. Close Redis connection
  try {
    console.log("[worker] Closing Redis connection...");
    await connection.quit();
    console.log("[worker] Redis connection closed.");
  } catch (err) {
    hasError = true;
    console.error("[worker] Error closing Redis connection:", err.message);
  }

  // 6. Disconnect Prisma client
  try {
    console.log("[worker] Disconnecting Prisma client...");
    await prisma.$disconnect();
    console.log("[worker] Prisma disconnected.");
  } catch (err) {
    hasError = true;
    console.error("[worker] Error disconnecting Prisma client:", err.message);
  }

  // Clear watchdog before exiting
  if (shutdownWatchdog) {
    clearTimeout(shutdownWatchdog);
    shutdownWatchdog = null;
  }

  if (hasError) {
    console.error("[worker] Graceful shutdown completed with errors.");
    process.exit(1);
  } else {
    console.log("[worker] Graceful shutdown completed successfully.");
    process.exit(0);
  }
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

module.exports = {
  handleShutdown,
  resolveShutdownTimeout,
};