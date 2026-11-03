// Recovery sweep: unfinished runs whose BullMQ job was lost get exactly one job back, under the
// same deterministic id; jobs that will still run are never touched.
// MOCKED: Prisma (in-memory runs + step executions), a BullMQ-like queue (ignores duplicate job
// ids and keeps completed/failed jobs, like BullMQ) and Redis (for the sweep lock).
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { recoverRuns, createSweepLock, startRecoveryScheduler, STALE_AFTER_MS, MAX_RECOVERY_ATTEMPTS } = require("../src/runRecovery");

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);
const ago = (ms) => new Date(NOW - ms);
const MIN = 60_000;

// ── Fakes ──
let runs, queue, logs;
function makeQueue() {
  const jobs = new Map();
  const adds = [];
  const removed = [];
  const makeJob = (id, name, data, state, delay = 0) => {
    const job = {
      id, name, data, state, delay,
      async getState() { return jobs.get(id) === job ? job.state : "unknown"; },
      async remove() {
        if (job.state === "active") throw new Error("Job is locked");
        removed.push(id);
        jobs.delete(id);
      },
    };
    return job;
  };
  return {
    jobs, adds, removed,
    async add(name, data, opts) {
      adds.push({ name, data, opts });
      if (jobs.has(opts.jobId)) return jobs.get(opts.jobId); // BullMQ: existing id -> ignored
      const job = makeJob(opts.jobId, name, data, opts.delay > 0 ? "delayed" : "waiting", opts.delay);
      jobs.set(opts.jobId, job);
      return job;
    },
    async getJob(id) { return jobs.get(id); },
    put(id, name, data, state) { jobs.set(id, makeJob(id, name, data, state)); },
  };
}
const prisma = {
  zapRun: {
    findMany: async ({ where }) => runs
      .filter((r) => r.status === where.status)
      .map((r) => ({ ...r, stepExecutions: [...(r.stepExecutions || [])].sort((a, b) => a.createdAt - b.createdAt) })),
  },
};
function makeRedis() {
  const store = new Map();
  return {
    async set(key, value, px, ttl, nx) { if (nx === "NX" && store.has(key)) return null; store.set(key, value); return "OK"; },
    async get(key) { return store.get(key) ?? null; },
    async del(key) { store.delete(key); },
  };
}
const log = { log: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m) };
const sweep = (opts = {}) => recoverRuns(prisma, queue, { now: NOW, log, ...opts });

// ── Data helpers ──
const actionExec = (stepId, at, extra = {}) => ({ id: `e_${stepId}`, stepId, status: "SUCCESS", output: {}, createdAt: at, updatedAt: at, reusedFromRunId: null, step: { type: "ACTION", config: {} }, ...extra });
const delayExec = (stepId, at, seconds, extra = {}) => ({ id: `e_${stepId}`, stepId, status: "SUCCESS", output: { delayedSeconds: seconds }, createdAt: at, updatedAt: at, reusedFromRunId: null, step: { type: "DELAY", config: { seconds } }, ...extra });
const runningRun = (id, stepExecutions, startedAt = stepExecutions[0]?.createdAt || ago(60 * MIN)) => ({ id, status: "RUNNING", createdAt: startedAt, startedAt, stepExecutions });

beforeEach(() => {
  runs = [];
  queue = makeQueue();
  logs = [];
});

// ── Delayed resume jobs ──
test("Redis lost a delayed resume job: re-added under the same id with the REMAINING wait", async () => {
  runs = [runningRun("r1", [actionExec("s1", ago(2 * MIN)), delayExec("d1", ago(100_000), 600)])];
  const result = await sweep();
  assert.equal(result.r1, "added");
  const job = queue.jobs.get("zap-run-r1-after-d1");
  assert.ok(job);
  assert.equal(job.name, "resume-zap-run");
  assert.deepEqual(job.data, { zapRunId: "r1", resumeAfterStepId: "d1" });
  assert.equal(job.delay, 500_000, "600 s wait started 100 s ago -> 500 s left, not 600");
});

test("worker crashed between recording the Delay and scheduling its resume: the resume is scheduled", async () => {
  // The Delay row exists (it's written first) but no resume job was ever added.
  runs = [runningRun("r1", [delayExec("d1", ago(5_000), 60)])];
  await sweep();
  assert.equal(queue.jobs.get("zap-run-r1-after-d1").delay, 55_000);
});

test("Delay overdue while Redis was down, run quiet since: resumes now (delay 0)", async () => {
  runs = [runningRun("r1", [delayExec("d1", ago(3 * 60 * MIN), 60)])];
  await sweep();
  assert.equal(queue.jobs.get("zap-run-r1-after-d1").delay, 0);
});

test("Delay only just due and its job is gone: left alone for now (a lost job might still be executing)", async () => {
  runs = [runningRun("r1", [delayExec("d1", ago(2 * MIN), 60)])];
  const result = await sweep();
  assert.equal(result.r1, "recent");
  assert.equal(queue.adds.length, 0);
});

test("existing delayed or active resume job: untouched", async () => {
  runs = [runningRun("r1", [delayExec("d1", ago(MIN), 600)]), runningRun("r2", [delayExec("d2", ago(3 * 60 * MIN), 60)])];
  queue.put("zap-run-r1-after-d1", "resume-zap-run", { zapRunId: "r1", resumeAfterStepId: "d1" }, "delayed");
  queue.put("zap-run-r2-after-d2", "resume-zap-run", { zapRunId: "r2", resumeAfterStepId: "d2" }, "active");
  const result = await sweep();
  assert.deepEqual(result, { r1: "pending", r2: "pending" });
  assert.equal(queue.adds.length, 0);
  assert.equal(queue.removed.length, 0);
});

test("failed resume job occupying the id: removed and re-added (it never ran the steps after the Delay)", async () => {
  runs = [runningRun("r1", [delayExec("d1", ago(10 * MIN), 60)])];
  queue.put("zap-run-r1-after-d1", "resume-zap-run", { zapRunId: "r1", resumeAfterStepId: "d1" }, "failed");
  const result = await sweep();
  assert.equal(result.r1, "replaced");
  assert.deepEqual(queue.removed, ["zap-run-r1-after-d1"]);
  const job = queue.jobs.get("zap-run-r1-after-d1");
  assert.equal(job.state, "waiting");
  assert.deepEqual(job.data, { zapRunId: "r1", resumeAfterStepId: "d1", recoveryAttempt: 1 });
});

test(`a job that keeps failing is given up after ${MAX_RECOVERY_ATTEMPTS} recovery attempts and logged`, async () => {
  runs = [runningRun("r1", [delayExec("d1", ago(10 * MIN), 60)])];
  queue.put("zap-run-r1-after-d1", "resume-zap-run", { zapRunId: "r1", resumeAfterStepId: "d1", recoveryAttempt: MAX_RECOVERY_ATTEMPTS }, "failed");
  const result = await sweep();
  assert.equal(result.r1, "gave-up");
  assert.equal(queue.adds.length, 0);
  assert.ok(logs.some((m) => m.includes("for a person to check")));
});

test("completed resume job but the run is still waiting at the Delay: kept while recent, replaced once stale", async () => {
  runs = [runningRun("r1", [delayExec("d1", ago(3 * MIN), 60)])];
  queue.put("zap-run-r1-after-d1", "resume-zap-run", { zapRunId: "r1", resumeAfterStepId: "d1" }, "completed");
  assert.equal((await sweep()).r1, "recent");
  assert.equal(queue.adds.length, 0);

  assert.equal((await sweep({ now: NOW + STALE_AFTER_MS })).r1, "replaced");
  assert.equal(queue.jobs.get("zap-run-r1-after-d1").state, "waiting");
});

test("a Delay reused by 'Retry from failed step' is not treated as waiting", async () => {
  runs = [runningRun("r1", [delayExec("d1", ago(MIN), 600, { reusedFromRunId: "r0" })])];
  const result = await sweep();
  assert.equal(result.r1, "recent", "treated as a normal running run (recent: left alone)");
  assert.equal(queue.adds.length, 0);
});

// ── Normal execution jobs ──
test("Redis lost a normal execution job: a stale RUNNING run gets zap-run-<id> back", async () => {
  runs = [runningRun("r1", [actionExec("s1", ago(30 * MIN), { status: "RUNNING" })])];
  const result = await sweep();
  assert.equal(result.r1, "added");
  assert.deepEqual(queue.jobs.get("zap-run-r1").data, { zapRunId: "r1" });
  // The worker's crash recovery then fails the mid-request step as "outcome unknown" -
  // nothing is re-sent and the run is not marked successful here.
});

test("a recently active RUNNING run is not re-queued even if its job is missing", async () => {
  runs = [runningRun("r1", [actionExec("s1", ago(MIN))])];
  const result = await sweep();
  assert.equal(result.r1, "recent");
  assert.equal(queue.adds.length, 0);
});

test("stale run after a Delay (resume job finished or lost mid-way): the resume job is rebuilt, not the original", async () => {
  runs = [runningRun("r1", [delayExec("d1", ago(60 * MIN), 60), actionExec("s2", ago(50 * MIN), { status: "RUNNING" })])];
  queue.put("zap-run-r1", "execute-zap-run", { zapRunId: "r1" }, "completed"); // the pre-Delay part
  await sweep();
  assert.ok(queue.jobs.get("zap-run-r1-after-d1"), "resume job rebuilt");
  assert.equal(queue.jobs.get("zap-run-r1").state, "completed", "original job left alone");
});

test("an active execution job is never touched, however old the run looks", async () => {
  runs = [runningRun("r1", [actionExec("s1", ago(60 * MIN))])];
  queue.put("zap-run-r1", "execute-zap-run", { zapRunId: "r1" }, "active");
  const result = await sweep();
  assert.equal(result.r1, "pending");
  assert.equal(queue.adds.length + queue.removed.length, 0);
});

test("QUEUED run whose job was lost: re-queued; one whose job is waiting: untouched; failed job: replaced", async () => {
  runs = [
    { id: "q1", status: "QUEUED", createdAt: ago(MIN) },
    { id: "q2", status: "QUEUED", createdAt: ago(MIN) },
    { id: "q3", status: "QUEUED", createdAt: ago(MIN) },
  ];
  queue.put("zap-run-q2", "execute-zap-run", { zapRunId: "q2" }, "waiting");
  queue.put("zap-run-q3", "execute-zap-run", { zapRunId: "q3" }, "failed");
  const result = await sweep();
  assert.deepEqual(result, { q1: "added", q2: "pending", q3: "replaced" });
});

// ── Finished and deleted runs ──
test("a run that already completed: nothing is queued, leftover jobs untouched", async () => {
  runs = [{ id: "r1", status: "SUCCESS", createdAt: ago(60 * MIN), stepExecutions: [delayExec("d1", ago(60 * MIN), 60)] }];
  queue.put("zap-run-r1-after-d1", "resume-zap-run", { zapRunId: "r1", resumeAfterStepId: "d1" }, "completed");
  const result = await sweep();
  assert.deepEqual(result, {});
  assert.equal(queue.adds.length + queue.removed.length, 0);
});

test("a run that was deleted (Zap deleted): nothing is queued; its leftover delayed job stays (the worker skips it)", async () => {
  queue.put("zap-run-gone-after-d1", "resume-zap-run", { zapRunId: "gone", resumeAfterStepId: "d1" }, "delayed");
  const result = await sweep();
  assert.deepEqual(result, {});
  assert.equal(queue.adds.length + queue.removed.length, 0);
});

// ── Concurrency ──
test("concurrent sweeps in two processes: the lock lets one act; the other skips", async () => {
  runs = [runningRun("r1", [delayExec("d1", ago(MIN), 600)]), { id: "q1", status: "QUEUED", createdAt: ago(MIN) }];
  const redis = makeRedis();
  const [a, b] = await Promise.all([sweep({ acquireLock: createSweepLock(redis) }), sweep({ acquireLock: createSweepLock(redis) })]);
  assert.equal([a, b].filter((r) => r.skipped === "locked").length, 1);
  assert.equal(queue.adds.length, 2, "one add per run");
  assert.equal(await redis.get("flowline:run-recovery-lock"), null, "lock released");
});

test("concurrent sweeps without the lock still can't create duplicate jobs (deterministic ids)", async () => {
  runs = [
    runningRun("r1", [delayExec("d1", ago(MIN), 600)]),
    runningRun("r2", [delayExec("d2", ago(10 * MIN), 60)]),
    { id: "q1", status: "QUEUED", createdAt: ago(MIN) },
  ];
  queue.put("zap-run-r2-after-d2", "resume-zap-run", { zapRunId: "r2", resumeAfterStepId: "d2" }, "failed");
  await Promise.all([sweep(), sweep(), sweep()]);
  assert.deepEqual([...queue.jobs.keys()].sort(), ["zap-run-q1", "zap-run-r1-after-d1", "zap-run-r2-after-d2"]);
  assert.ok([...queue.jobs.values()].every((j) => j.state !== "failed"));

  await sweep(); // and a later sweep changes nothing
  assert.equal(queue.jobs.size, 3);
});

test("the scheduler sweeps at startup, one sweep at a time, and stop() waits for a running sweep", async () => {
  runs = [{ id: "q1", status: "QUEUED", createdAt: ago(MIN) }];
  const scheduler = startRecoveryScheduler({ prisma, queue, redis: makeRedis(), intervalMs: 60_000, log });
  const again = scheduler.sweep(); // while the startup sweep runs: same promise, no second sweep
  await again;
  await scheduler.stop();
  assert.equal(queue.adds.length, 1);
  assert.ok(queue.jobs.get("zap-run-q1"));
});
