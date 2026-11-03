// BullMQ job retention: the worker trims finished jobs, and a trimmed job id being added again
// can never re-run a workflow that already finished.
// MOCKED: BullMQ (captures the Worker's options and processor), Prisma, Redis, the polling engine.
// Real trimming against Redis is covered in redisRecovery.integration.test.js.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test";

const workerSrc = path.join(__dirname, "../src");
function stubModule(request, exports) {
  const resolved = require.resolve(request, { paths: [workerSrc] });
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

let workerOptions, processJob, queued;
stubModule("bullmq", {
  Worker: class { constructor(name, fn, opts) { processJob = fn; workerOptions = opts; } on() {} async close() {} },
  Queue: class {
    async add(name, data, opts) { if (!queued.has(opts.jobId)) queued.set(opts.jobId, { name, data, opts }); }
    async getJob() { return undefined; }
    async close() {}
  },
});
stubModule("ioredis", class { async quit() {} async set() { return "OK"; } async get() { return null; } async del() {} });
stubModule(path.join(workerSrc, "pollingCron"), { startPollingScheduler: () => {}, stopPollingScheduler: () => {}, waitForPollingCycle: async () => {} });

let db = { runs: [], steps: [], executions: [] };
const touched = [];
const prisma = {
  zapRun: {
    findUnique: async ({ where }) => db.runs.find((r) => r.id === where.id || r.idempotencyKey === where.idempotencyKey) || null,
    findMany: async () => [],
    update: async ({ where, data }) => { touched.push(["zapRun.update", where.id, data]); return Object.assign(db.runs.find((r) => r.id === where.id), data); },
    create: async ({ data }) => {
      if (db.runs.some((r) => r.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
      const run = { id: `run_${db.runs.length + 1}`, ...data };
      db.runs.push(run);
      return run;
    },
  },
  step: { findMany: async () => { touched.push(["step.findMany"]); return db.steps; } },
  stepExecution: {
    count: async () => 0,
    findMany: async () => [],
    create: async ({ data }) => { touched.push(["stepExecution.create", data.stepId]); return { id: "e1", ...data }; },
    update: async () => {},
  },
  alert: { create: async () => {} },
  zap: { findUnique: async () => null },
};
stubModule(path.join(workerSrc, "prismaClient"), prisma);

const { JOB_RETENTION, createAndQueueRun } = require("../src/runQueue");
require("../src/index");

beforeEach(() => {
  queued = new Map();
  touched.length = 0;
  db = {
    runs: [],
    steps: [{ id: "s1", zapId: "z1", type: "ACTION", name: "Send", order: 0, parentStepId: null, config: { provider: "slack", action: "send_message", channel: "C1", text: "hi" } }],
    executions: [],
  };
});

test("retention: completed jobs kept 1 day / 2,000; failed jobs kept 7 days / 1,000", () => {
  assert.deepEqual(JOB_RETENTION, {
    removeOnComplete: { age: 86_400, count: 2000 },
    removeOnFail: { age: 604_800, count: 1000 },
  });
});

test("retention is set on the Worker, so it applies to jobs from every producer", () => {
  assert.deepEqual(workerOptions.removeOnComplete, JOB_RETENTION.removeOnComplete);
  assert.deepEqual(workerOptions.removeOnFail, JOB_RETENTION.removeOnFail);
  assert.equal(workerOptions.maxStalledCount, 3, "existing options kept");
});

for (const status of ["SUCCESS", "FAILED", "FILTERED"]) {
  test(`a trimmed job id added again for a ${status} run: the worker skips it - no step runs, nothing changes`, async () => {
    db.runs = [{ id: "r1", zapId: "z1", status, triggerPayload: {}, retryOfRunId: null, startedAt: new Date(), completedAt: new Date() }];
    await processJob({ id: "zap-run-r1", data: { zapRunId: "r1" } }); // e.g. re-added after its old record was trimmed
    await processJob({ id: "zap-run-r1-after-d1", data: { zapRunId: "r1", resumeAfterStepId: "d1" } });
    assert.deepEqual(touched, [], "no steps loaded, no executions created, the run not updated");
    assert.equal(db.runs[0].status, status);
  });
}

test("a redelivered trigger event for a finished run doesn't queue it again, even with its old job trimmed", async () => {
  const event = { zapId: "z1", idempotencyKey: "t1-gmail-m1", triggerPayload: { email: { subject: "hi" } } };
  const first = await createAndQueueRun(prisma, { add: async (n, d, o) => queued.set(o.jobId, d) }, event);
  assert.equal(queued.size, 1);
  first.run.status = "SUCCESS"; // the run finished, then retention trimmed its job record
  queued.clear();

  const again = await createAndQueueRun(prisma, { add: async (n, d, o) => queued.set(o.jobId, d) }, event);
  assert.equal(again.created, false);
  assert.equal(queued.size, 0, "not re-queued: only QUEUED runs are (re)queued");
});
