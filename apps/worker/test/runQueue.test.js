// Creating + queueing runs exactly once. MOCKED: Prisma and the BullMQ queue (the fake
// queue ignores duplicate job ids, like BullMQ does).
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createAndQueueRun, requeueQueuedRuns, jobIdFor } = require("../src/runQueue");

let runs, jobs, prisma, queue;
beforeEach(() => {
  runs = [];
  jobs = new Map();
  prisma = { zapRun: {
    create: async ({ data }) => {
      if (runs.some((r) => r.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
      const run = { id: `run_${runs.length + 1}`, ...data }; runs.push(run); return run;
    },
    findUnique: async ({ where }) => runs.find((r) => r.idempotencyKey === where.idempotencyKey) || null,
    findMany: async ({ where }) => runs.filter((r) => r.status === where.status),
  } };
  queue = { add: async (name, data, opts) => { if (!jobs.has(opts.jobId)) jobs.set(opts.jobId, data); } };
});

const input = { zapId: "z1", idempotencyKey: "t1-gmail-m1", triggerPayload: { email: { subject: "hi" } } };

test("creates the run and queues it under a per-run job id", async () => {
  const { run, created } = await createAndQueueRun(prisma, queue, input);
  assert.equal(created, true);
  assert.equal(run.status, "QUEUED");
  assert.deepEqual([...jobs.keys()], [jobIdFor(run.id)]);
});

test("same event twice: one run, one job", async () => {
  await createAndQueueRun(prisma, queue, input);
  const second = await createAndQueueRun(prisma, queue, input);
  assert.equal(second.created, false);
  assert.equal(runs.length, 1);
  assert.equal(jobs.size, 1);
});

test("crash after saving the run but before queueing: the next attempt queues it", async () => {
  const brokenQueue = { add: async () => { throw new Error("worker died"); } };
  await assert.rejects(createAndQueueRun(prisma, brokenQueue, input));
  assert.equal(runs.length, 1);
  assert.equal(jobs.size, 0, "run exists but was never queued");

  await createAndQueueRun(prisma, queue, input);
  assert.equal(runs.length, 1);
  assert.equal(jobs.size, 1, "re-processing the event queues the existing run");
});

test("an existing run that already finished is not queued again", async () => {
  runs.push({ id: "run_done", idempotencyKey: input.idempotencyKey, status: "SUCCESS" });
  await createAndQueueRun(prisma, queue, input);
  assert.equal(jobs.size, 0);
});

test("startup sweep queues waiting runs without duplicating existing jobs", async () => {
  runs.push({ id: "a", status: "QUEUED" }, { id: "b", status: "QUEUED" }, { id: "c", status: "SUCCESS" });
  jobs.set(jobIdFor("a"), { zapRunId: "a" });
  const n = await requeueQueuedRuns(prisma, queue);
  assert.equal(n, 2);
  assert.deepEqual([...jobs.keys()].sort(), [jobIdFor("a"), jobIdFor("b")]);
});
