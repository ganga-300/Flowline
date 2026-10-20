/**
 * Creating and queueing Zap runs so that each trigger event produces exactly one run and
 * one job, even if the process crashes in between:
 *  - the run's idempotencyKey (unique in the DB) prevents a second run for the same event;
 *  - the BullMQ jobId is fixed per run, and BullMQ ignores adding a job whose id already
 *    exists - so queueing the same run again is always safe.
 * That lets callers (pollers, webhooks, the startup sweep) simply re-queue on any doubt.
 */
const jobIdFor = (runId) => `zap-run-${runId}`;

async function queueRun(queue, run) {
  await queue.add("execute-zap-run", { zapRunId: run.id }, { jobId: jobIdFor(run.id) });
}

async function createAndQueueRun(prisma, queue, { zapId, idempotencyKey, triggerPayload }) {
  let run;
  let created = true;
  try {
    run = await prisma.zapRun.create({
      data: { zapId, status: "QUEUED", idempotencyKey, triggerPayload },
    });
  } catch (err) {
    if (err.code !== "P2002") throw err;
    // Already created by an earlier attempt - it may not have been queued before a crash.
    created = false;
    run = await prisma.zapRun.findUnique({ where: { idempotencyKey } });
  }
  if (run && run.status === "QUEUED") {
    await queueRun(queue, run);
  }
  return { run, created };
}

/** Queues every run still waiting in QUEUED (no-op for runs whose job already exists). */
async function requeueQueuedRuns(prisma, queue) {
  const waiting = await prisma.zapRun.findMany({ where: { status: "QUEUED" }, select: { id: true } });
  for (const run of waiting) {
    await queueRun(queue, run);
  }
  return waiting.length;
}

module.exports = { jobIdFor, queueRun, createAndQueueRun, requeueQueuedRuns };
