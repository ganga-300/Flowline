// Recovery sweep against a REAL Redis with the real BullMQ library (job states, removal of
// finished jobs, duplicate job ids, active-job locks, the sweep lock across connections).
// Postgres is an in-memory fake: what's under test is BullMQ/Redis behaviour.
//
// Opt-in - skipped unless REDIS_INTEGRATION_URL is set. It FLUSHES that database, so point it
// at a throwaway Redis or an unused db index, e.g.
//   REDIS_INTEGRATION_URL=redis://localhost:6390/15 npm test
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const URL = process.env.REDIS_INTEGRATION_URL;
const skip = !URL && "set REDIS_INTEGRATION_URL to run against a real Redis";

const { Queue, Worker } = require("bullmq");
const IORedis = require("ioredis");
const { recoverRuns, createSweepLock, startRecoveryScheduler, STALE_AFTER_MS } = require("../src/runRecovery");
const { JOB_RETENTION } = require("../src/runQueue");

const MIN = 60_000;
const silent = { log() {}, warn() {}, error() {} };
const connect = () => new IORedis(URL, { maxRetriesPerRequest: null });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (check, timeoutMs = 10_000) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(50);
  }
  return false;
};

// ── In-memory Postgres (the compare-and-set itself is tested against real Postgres in
// recoveryAttempts.postgres.test.js) ──
let runs, alerts;
const matchesWhere = (row, where) => Object.entries(where).every(([key, cond]) =>
  key === "status" && cond?.in ? cond.in.includes(row.status) : (row[key] ?? (key === "recoveryAttempts" ? 0 : undefined)) === cond);
const prisma = {
  zapRun: {
    findMany: async ({ where }) => runs.filter((r) => r.status === where.status).map((r) => ({ ...r, recoveryAttempts: r.recoveryAttempts ?? 0, stepExecutions: [...r.stepExecutions] })),
    updateMany: async ({ where, data }) => {
      const matched = runs.filter((r) => matchesWhere(r, where));
      for (const r of matched) {
        if (data.recoveryAttempts?.increment) r.recoveryAttempts = (r.recoveryAttempts ?? 0) + data.recoveryAttempts.increment;
        else Object.assign(r, data);
      }
      return { count: matched.length };
    },
    findUnique: async ({ where }) => ({ ...runs.find((r) => r.id === where.id), zapId: "z1", zap: { userId: "u1", zapName: "It" } }),
  },
  stepExecution: { updateMany: async () => ({ count: 0 }) },
  alert: { create: async ({ data }) => { alerts.push(data); return data; } },
};
const ago = (ms) => new Date(Date.now() - ms);
const delayExec = (stepId, at, seconds) => ({ id: `e_${stepId}`, stepId, status: "SUCCESS", output: { delayedSeconds: seconds }, createdAt: at, updatedAt: at, reusedFromRunId: null, step: { type: "DELAY", config: { seconds } } });
const actionExec = (stepId, at, status = "SUCCESS") => ({ id: `e_${stepId}`, stepId, status, output: {}, createdAt: at, updatedAt: at, reusedFromRunId: null, step: { type: "ACTION", config: {} } });
const running = (id, stepExecutions, startedAt = ago(60 * MIN)) => ({ id, status: "RUNNING", createdAt: startedAt, startedAt, stepExecutions });

// ── Real Redis / BullMQ ──
let admin, queueName, opened;
const open = (thing) => { opened.push(thing); return thing; };
const newQueue = () => open(new Queue(queueName, { connection: open(connect()) }));
/** A real BullMQ worker; `handler` decides what each job does. */
const newWorker = (handler, opts = {}) => open(new Worker(queueName, handler, { connection: open(connect()), lockDuration: 30_000, ...opts }));
const stateOf = async (queue, id) => { const job = await queue.getJob(id); return job ? job.getState() : "missing"; };
/** Job counts for these states only (BullMQ also reports e.g. "paused"). */
const countsOf = async (queue) => {
  const { waiting, delayed, active, failed, completed } = await queue.getJobCounts("waiting", "delayed", "active", "failed", "completed");
  return { waiting, delayed, active, failed, completed };
};

/** Closes workers and queues before the connections they use. */
async function closeAll() {
  for (const thing of (opened || []).reverse()) {
    await (thing instanceof IORedis ? thing.quit() : thing.close()).catch(() => {});
  }
  opened = [];
}

before(async () => { if (!skip) admin = connect(); });
beforeEach(async () => {
  await closeAll();
  runs = [];
  alerts = [];
  queueName = `recovery-it-${crypto.randomUUID()}`;
});
after(async () => {
  await closeAll();
  if (admin) await admin.quit();
});

test("1. delayed resume job lost when Redis is cleared: a restarted worker rebuilds it with the remaining delay", { skip }, async () => {
  // The worker paused at a Delay 4 min ago (10 min wait) and scheduled its resume job.
  const startedAt = ago(4 * MIN);
  runs = [running("r1", [actionExec("s1", ago(5 * MIN)), delayExec("d1", startedAt, 600)])];
  const before = newQueue();
  await before.add("resume-zap-run", { zapRunId: "r1", resumeAfterStepId: "d1" }, { jobId: "zap-run-r1-after-d1", delay: 10 * MIN });
  assert.equal(await stateOf(before, "zap-run-r1-after-d1"), "delayed");

  await admin.flushdb(); // Redis restarted with no persistence
  assert.equal(await stateOf(before, "zap-run-r1-after-d1"), "missing");

  // Worker restart: a new process, new connections, the startup sweep.
  const restarted = newQueue();
  const scheduler = startRecoveryScheduler({ prisma, queue: restarted, redis: open(connect()), intervalMs: 60 * MIN, log: silent });
  await scheduler.sweep();
  await scheduler.stop();

  const job = await restarted.getJob("zap-run-r1-after-d1");
  assert.equal(await job.getState(), "delayed");
  assert.deepEqual(job.data, { zapRunId: "r1", resumeAfterStepId: "d1" });
  const fireAt = job.timestamp + job.delay;
  const expected = startedAt.getTime() + 600_000;
  assert.ok(Math.abs(fireAt - expected) < 2_000, `fires at the original time (off by ${fireAt - expected} ms), not 10 min from now`);
});

test("1b. a rebuilt resume job actually fires once, at the remaining delay", { skip }, async () => {
  runs = [running("r1", [delayExec("d1", ago(9_000), 10)])]; // 1 s left
  const queue = newQueue();
  await recoverRuns(prisma, queue, { log: silent });
  const processed = [];
  newWorker(async (job) => { processed.push({ id: job.id, data: job.data, at: Date.now() }); });
  assert.ok(await until(() => processed.length > 0, 8_000), "the job ran");
  await sleep(500);
  assert.equal(processed.length, 1);
  assert.deepEqual(processed[0].data, { zapRunId: "r1", resumeAfterStepId: "d1" });
});

test("2. failed job: recovery removes it and re-adds a fresh job under the same id", { skip }, async () => {
  runs = [running("r1", [delayExec("d1", ago(10 * MIN), 60)])];
  const queue = newQueue();
  await queue.add("resume-zap-run", { zapRunId: "r1", resumeAfterStepId: "d1" }, { jobId: "zap-run-r1-after-d1" });
  const worker = newWorker(async () => { throw new Error("database unavailable"); });
  assert.ok(await until(async () => (await stateOf(queue, "zap-run-r1-after-d1")) === "failed"));
  await worker.close();

  // Real BullMQ: adding the same id while the failed job exists is ignored.
  await queue.add("resume-zap-run", { zapRunId: "r1", resumeAfterStepId: "d1" }, { jobId: "zap-run-r1-after-d1" });
  assert.equal(await stateOf(queue, "zap-run-r1-after-d1"), "failed", "the id is occupied - why recovery must remove it");

  const result = await recoverRuns(prisma, queue, { log: silent });
  assert.equal(result.r1, "replaced");
  const job = await queue.getJob("zap-run-r1-after-d1");
  assert.equal(await job.getState(), "waiting");
  assert.equal(job.attemptsMade, 0);
  assert.equal(job.data.recoveryAttempt, undefined, "no attempt count in BullMQ job data");
  assert.equal(runs[0].recoveryAttempts, 1, "counted in Postgres");

  const processed = [];
  newWorker(async (j) => { processed.push(j.data); });
  assert.ok(await until(() => processed.length === 1));
  assert.equal((await queue.getJobCounts("failed")).failed, 0);
});

test("3. completed job with the run still RUNNING: left while recent, removed and recreated once stale", { skip }, async () => {
  runs = [running("r1", [actionExec("s1", ago(30 * MIN), "RUNNING")])];
  const queue = newQueue();
  await queue.add("execute-zap-run", { zapRunId: "r1" }, { jobId: "zap-run-r1" });
  const worker = newWorker(async () => "done");
  assert.ok(await until(async () => (await stateOf(queue, "zap-run-r1")) === "completed"));
  await worker.close();

  runs[0].stepExecutions[0].updatedAt = ago(MIN); // recent activity
  assert.equal((await recoverRuns(prisma, queue, { log: silent })).r1, "recent");
  assert.equal(await stateOf(queue, "zap-run-r1"), "completed");

  runs[0].stepExecutions[0].updatedAt = ago(STALE_AFTER_MS + MIN); // quiet for > 10 min
  assert.equal((await recoverRuns(prisma, queue, { log: silent })).r1, "replaced");
  const job = await queue.getJob("zap-run-r1");
  assert.equal(await job.getState(), "waiting");
  assert.equal(job.data.recoveryAttempt, undefined, "no attempt count in BullMQ job data");
  assert.equal(runs[0].recoveryAttempts, 1, "counted in Postgres");
  assert.equal(job.returnvalue, null, "a new job, not the old completed one");
});

test("4. two worker processes sweeping at once: the lock lets one act, and no duplicate jobs exist", { skip }, async () => {
  runs = [
    running("r1", [delayExec("d1", ago(MIN), 600)]),
    running("r2", [delayExec("d2", ago(30 * MIN), 60)]),
    running("r3", [actionExec("s1", ago(30 * MIN), "RUNNING")]),
    { id: "q1", status: "QUEUED", createdAt: ago(MIN), stepExecutions: [] },
  ];
  const setup = newQueue();
  await setup.add("resume-zap-run", { zapRunId: "r2", resumeAfterStepId: "d2" }, { jobId: "zap-run-r2-after-d2" });
  const failing = newWorker(async () => { throw new Error("boom"); });
  assert.ok(await until(async () => (await stateOf(setup, "zap-run-r2-after-d2")) === "failed"));
  await failing.close();

  // Two "processes": separate queues and Redis connections, each with its own lock client.
  const a = newQueue();
  const b = newQueue();
  const results = await Promise.all([
    recoverRuns(prisma, a, { acquireLock: createSweepLock(open(connect())), log: silent }),
    recoverRuns(prisma, b, { acquireLock: createSweepLock(open(connect())), log: silent }),
  ]);
  assert.equal(results.filter((r) => r.skipped === "locked").length, 1, "exactly one sweep ran");

  // And back-to-back sweeps from both processes change nothing.
  await recoverRuns(prisma, a, { acquireLock: createSweepLock(open(connect())), log: silent });
  await recoverRuns(prisma, b, { acquireLock: createSweepLock(open(connect())), log: silent });

  assert.deepEqual(await countsOf(setup), { waiting: 3, delayed: 1, active: 0, failed: 0, completed: 0 }, "one job per run");
  for (const id of ["zap-run-q1", "zap-run-r1-after-d1", "zap-run-r2-after-d2", "zap-run-r3"]) {
    assert.ok(await setup.getJob(id), `${id} exists`);
  }
});

test("5. an active job is never replaced, even when the run looks stale", { skip }, async () => {
  runs = [running("r1", [actionExec("s1", ago(60 * MIN), "RUNNING")])];
  const queue = newQueue();
  await queue.add("execute-zap-run", { zapRunId: "r1" }, { jobId: "zap-run-r1" });
  let release;
  const blocked = new Promise((r) => { release = r; });
  const worker = newWorker(async () => { await blocked; });
  assert.ok(await until(async () => (await stateOf(queue, "zap-run-r1")) === "active"));

  const result = await recoverRuns(prisma, queue, { log: silent });
  assert.equal(result.r1, "pending");
  assert.equal(await stateOf(queue, "zap-run-r1"), "active");
  // Real BullMQ refuses to remove a locked (active) job anyway.
  await assert.rejects((await queue.getJob("zap-run-r1")).remove(), /locked/i);

  release();
  assert.ok(await until(async () => (await stateOf(queue, "zap-run-r1")) === "completed"));
  await worker.close();
});

test("6. completed and deleted runs are never recovered; their leftover jobs are untouched", { skip }, async () => {
  runs = [{ id: "done", status: "SUCCESS", createdAt: ago(60 * MIN), stepExecutions: [delayExec("d1", ago(60 * MIN), 60)] }];
  const queue = newQueue();
  await queue.add("resume-zap-run", { zapRunId: "done", resumeAfterStepId: "d1" }, { jobId: "zap-run-done-after-d1", delay: 10 * MIN });
  await queue.add("resume-zap-run", { zapRunId: "deleted", resumeAfterStepId: "d9" }, { jobId: "zap-run-deleted-after-d9", delay: 10 * MIN });

  const result = await recoverRuns(prisma, queue, { log: silent });
  assert.deepEqual(result, {});
  assert.deepEqual(await countsOf(queue), { waiting: 0, delayed: 2, active: 0, failed: 0, completed: 0 });
});

// ── Job retention (JOB_RETENTION on the Worker) ──
const idsIn = async (queue, state) => (await queue.getJobs([state])).map((j) => j.id).sort();
/** A job whose processing waits until release(id). */
function gates() {
  const pending = new Map();
  return {
    wait: (id) => new Promise((resolve) => pending.set(id, resolve)),
    release: (id) => pending.get(id)?.(),
  };
}

test("R1. completed jobs are trimmed by count; waiting, delayed and active jobs are untouched", { skip }, async () => {
  const queue = newQueue();
  const gate = gates();
  const worker = newWorker(async (job) => { if (job.name === "block") await gate.wait(job.id); }, { concurrency: 2, removeOnComplete: { count: 2 } });

  await queue.add("later", {}, { jobId: "delayed-1", delay: 60 * MIN });
  // One at a time, so the completion order is fixed (with 2 slots, q2 could finish after q3).
  for (const id of ["q1", "q2", "q3", "q4"]) {
    await queue.add("quick", {}, { jobId: id });
    assert.ok(await until(async () => (await stateOf(queue, id)) === "completed"));
  }
  assert.deepEqual(await idsIn(queue, "completed"), ["q3", "q4"], "only the newest 2 completed jobs are kept");

  await queue.add("block", {}, { jobId: "b1" });
  await queue.add("block", {}, { jobId: "b2" });
  assert.ok(await until(async () => (await queue.getJobCounts("active")).active === 2));
  await worker.pause(true); // stop fetching; active jobs keep running
  await queue.add("quick", {}, { jobId: "w1" });
  await queue.add("quick", {}, { jobId: "w2" });

  gate.release("b1"); // b1 completes -> the completed list is trimmed while others wait/run
  assert.ok(await until(async () => (await stateOf(queue, "b1")) === "completed"));
  assert.deepEqual(await idsIn(queue, "completed"), ["b1", "q4"]);
  assert.equal(await stateOf(queue, "b2"), "active", "active job untouched");
  assert.equal(await stateOf(queue, "w1"), "waiting", "waiting jobs untouched");
  assert.equal(await stateOf(queue, "w2"), "waiting");
  assert.equal(await stateOf(queue, "delayed-1"), "delayed", "delayed job untouched");

  gate.release("b2");
  assert.ok(await until(async () => (await stateOf(queue, "b2")) === "completed"));
});

test("R2. completed jobs are trimmed by age (when a later job completes)", { skip }, async () => {
  const queue = newQueue();
  newWorker(async () => {}, { removeOnComplete: { age: 1 } });
  await queue.add("quick", {}, { jobId: "old" });
  assert.ok(await until(async () => (await stateOf(queue, "old")) === "completed"));
  await sleep(2_100);
  assert.equal(await stateOf(queue, "old"), "completed", "no background timer: still there until another job completes");
  await queue.add("quick", {}, { jobId: "new" });
  assert.ok(await until(async () => (await stateOf(queue, "new")) === "completed"));
  assert.ok(await until(async () => (await stateOf(queue, "old")) === "missing"), "the aged job was trimmed");
});

test("R3. failed jobs are trimmed by count, and a kept failed job is still found and replaced by the sweep", { skip }, async () => {
  runs = [running("r1", [delayExec("d1", ago(10 * MIN), 60)])];
  const queue = newQueue();
  const worker = newWorker(async () => { throw new Error("boom"); }, { removeOnFail: { count: 2 } });
  for (const id of ["f1", "f2", "f3", "zap-run-r1-after-d1"]) {
    await queue.add(id.startsWith("zap") ? "resume-zap-run" : "x", id.startsWith("zap") ? { zapRunId: "r1", resumeAfterStepId: "d1" } : {}, { jobId: id });
    assert.ok(await until(async () => (await stateOf(queue, id)) === "failed"));
  }
  assert.deepEqual(await idsIn(queue, "failed"), ["f3", "zap-run-r1-after-d1"], "only the newest 2 failed jobs are kept");
  await worker.close();

  assert.equal((await recoverRuns(prisma, queue, { log: silent })).r1, "replaced");
  assert.equal(await stateOf(queue, "zap-run-r1-after-d1"), "waiting");
});

test("R4. failed jobs are trimmed by age (when a later job fails)", { skip }, async () => {
  const queue = newQueue();
  newWorker(async () => { throw new Error("boom"); }, { removeOnFail: { age: 1 } });
  await queue.add("x", {}, { jobId: "old" });
  assert.ok(await until(async () => (await stateOf(queue, "old")) === "failed"));
  await sleep(2_100);
  await queue.add("x", {}, { jobId: "new" });
  assert.ok(await until(async () => (await stateOf(queue, "new")) === "failed"));
  assert.ok(await until(async () => (await stateOf(queue, "old")) === "missing"));
});

test("R5. a trimmed job id can be added again (BullMQ's duplicate check no longer applies); the sweep never does so for a finished run", { skip }, async () => {
  runs = [{ id: "r1", status: "SUCCESS", createdAt: ago(2 * 24 * 60 * MIN), stepExecutions: [actionExec("s1", ago(2 * 24 * 60 * MIN))] }];
  const queue = newQueue();
  const worker = newWorker(async () => {}, { removeOnComplete: { count: 1 } });
  await queue.add("execute-zap-run", { zapRunId: "r1" }, { jobId: "zap-run-r1" });
  assert.ok(await until(async () => (await stateOf(queue, "zap-run-r1")) === "completed"));
  await queue.add("execute-zap-run", { zapRunId: "other" }, { jobId: "zap-run-other" });
  assert.ok(await until(async () => (await stateOf(queue, "zap-run-r1")) === "missing"), "trimmed");
  await worker.close();

  assert.deepEqual(await recoverRuns(prisma, queue, { log: silent }), {}, "finished run: not re-queued");
  await queue.add("execute-zap-run", { zapRunId: "r1" }, { jobId: "zap-run-r1" });
  assert.equal(await stateOf(queue, "zap-run-r1"), "waiting", "the id is free again - so the worker's finished-run check (jobRetention.test.js) is what prevents a re-run");
});

test("R6. a worker with the real JOB_RETENTION settings keeps recent finished jobs", { skip }, async () => {
  const queue = newQueue();
  newWorker(async (job) => { if (job.name === "fail") throw new Error("boom"); }, { ...JOB_RETENTION });
  await queue.add("ok", {}, { jobId: "c1" });
  await queue.add("fail", {}, { jobId: "x1" });
  assert.ok(await until(async () => (await stateOf(queue, "c1")) === "completed" && (await stateOf(queue, "x1")) === "failed"));
  await queue.add("ok", {}, { jobId: "c2" });
  assert.ok(await until(async () => (await stateOf(queue, "c2")) === "completed"));
  assert.deepEqual(await idsIn(queue, "completed"), ["c1", "c2"], "well within 1 day / 2,000: nothing trimmed");
  assert.deepEqual(await idsIn(queue, "failed"), ["x1"]);
});

test("R7. the 3-attempt limit holds through real retention trimming and a Redis wipe; then the run is FAILED", { skip }, async () => {
  runs = [running("r1", [actionExec("s1", ago(30 * MIN), "RUNNING")])]; // quiet, its job lost
  const queue = newQueue();
  newWorker(async () => { throw new Error("worker crashes on this run"); }, { removeOnFail: { count: 1 } });
  const failedNow = () => until(async () => (await stateOf(queue, "zap-run-r1")) === "failed");

  assert.equal((await recoverRuns(prisma, queue, { log: silent })).r1, "added");
  assert.ok(await failedNow());
  // Another job fails -> retention (count 1) trims the failed zap-run-r1 before the next sweep.
  await queue.add("x", {}, { jobId: "filler" });
  assert.ok(await until(async () => (await stateOf(queue, "zap-run-r1")) === "missing"), "trimmed");

  assert.equal((await recoverRuns(prisma, queue, { log: silent })).r1, "added", "seen as missing...");
  assert.equal(runs[0].recoveryAttempts, 2, "...but still counted (no reset)");
  assert.ok(await failedNow());

  await admin.flushdb(); // Redis restarted: every job record gone
  assert.equal((await recoverRuns(prisma, queue, { log: silent })).r1, "added");
  assert.equal(runs[0].recoveryAttempts, 3);
  assert.ok(await failedNow());

  assert.equal((await recoverRuns(prisma, queue, { log: silent })).r1, "gave-up");
  assert.equal(runs[0].status, "FAILED");
  assert.ok(runs[0].completedAt instanceof Date);
  assert.equal(alerts.length, 1);
  assert.deepEqual(await recoverRuns(prisma, queue, { log: silent }), {}, "never swept again");
});
