require("dotenv").config();
const { Worker ,Queue } = require("bullmq");
const IORedis = require("ioredis");
const prisma = require("./prismaClient");
const { evaluateCondition, resolveTemplate } = require("./conditions");
const { executeFormatterStep } = require("./formatter");
const TokenBucket = require("./rateLimiter");
const { getIntegrationHandler } = require("./integrations/registry");

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

  // Preserved fallback for custom HTTP request steps
  await slackBucket.consume();

  const { url, method = "POST", body = {} } = step.config || {};
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  const output = await res.json().catch(() => ({}));
  return { status: res.status, output };
}

async function executeAiStep(step) {
  const { model = "meta-llama/llama-3.1-8b-instruct:free", promptTemplate } = step.config;

  const prompt = resolveTemplate(step._context, promptTemplate);

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
    throw new Error(`AI step failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return { output: { content } };
}

// Retry wrapper - used for ACTION / AI steps that call external services
async function executeWithRetry(step, stepExecutionId, context) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (step.type === "AI") {
        return await executeAiStep({ ...step, _context: context });
      }
      if (step.type === "FORMATTER") {
        return executeFormatterStep(step, context);
      }
      return await executeActionStep(step, context);
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

  throw lastError;
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
async function executeStepList(steps, allSteps, context, zapRunId , resumeAfterStepId) {
  let resuming = !!resumeAfterStepId; // true agar resume ho raha hai, warna false
  for (const step of steps) {
    if (resuming) {
      if (step.id === resumeAfterStepId) {
        resuming = false; // yehi wo delay step tha - isse aage se normal chalna shuru karo
      }
      continue; // is step ko skip karo (already ho chuka hai pehle)
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
      const result = await executeStepList([selected], allSteps, context, zapRunId);
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
          await executeStepList(children, allSteps, loopContext, zapRunId);
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
      context.steps[step.id] = { output: result.output };
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
      const result = await executeStepList(nextChildren, allSteps, context, zapRunId);
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
    const allSteps = await prisma.step.findMany({ where: { zapId: run.zapId } });
    const topLevel = allSteps
      .filter((s) => !s.parentStepId)
      .sort((a, b) => a.order - b.order);

    const context = { trigger: run.triggerPayload || {}, steps: {} };

    if (resumeAfterStepId) {
      const priorExecutions = await prisma.stepExecution.findMany({
        where: { zapRunId, status: "SUCCESS" },
      });
      for (const pe of priorExecutions) {
        context.steps[pe.stepId] = { output: pe.output };
      }
    }

    await prisma.zapRun.update({
      where: { id: zapRunId },
      data: { status: "RUNNING" },
    });

    try {
      const result = await executeStepList(topLevel, allSteps, context, zapRunId,resumeAfterStepId);

      if (result.paused) {
        await zapExecutionQueue.add(
          "resume-zap-run",
          { zapRunId, resumeAfterStepId: result.paused.resumeAfterStepId },
          { delay: result.paused.delayMs }
        );
        return; // run stays RUNNING in the database until the resume completes
      }

      const finalStatus = result.filtered ? "FILTERED" : "SUCCESS";
      await prisma.zapRun.update({
        where: { id: zapRunId },
        data: { status: finalStatus },
      });
      console.log(`[worker] job ${job.id} completed with status ${finalStatus}`);
    } catch (err) {
      await prisma.zapRun.update({
        where: { id: zapRunId },
        data: { status: "FAILED" },
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
  { connection }
);

worker.on("error", (err) => console.error("[worker] connection error:", err));

console.log("Worker started, listening for jobs...");