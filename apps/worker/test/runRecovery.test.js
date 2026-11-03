// Recovery sweep: unfinished runs whose BullMQ job was lost get exactly one job back, under the
// same deterministic id; jobs that will still run are never touched.
// MOCKED: Prisma (in-memory runs + step executions), a BullMQ-like queue (ignores duplicate job
// ids and keeps completed/failed jobs, like BullMQ) and Redis (for the sweep lock).
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { recoverRuns, claimRecoveryAttempt, createSweepLock, startRecoveryScheduler, STALE_AFTER_MS, QUEUED_GRACE_MS, MAX_RECOVERY_ATTEMPTS } = require("../src/runRecovery");

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
let alerts;
const statusMatches = (status, where) => (where.status?.in ? where.status.in.includes(status) : !where.status || status === where.status);
const attempts = (r) => r.recoveryAttempts ?? 0; // column default
/** Applies Prisma update data, including { increment }. */
function applyData(row, data) {
  for (const [key, value] of Object.entries(data)) {
    row[key] = value && typeof value === "object" && "increment" in value ? (row[key] ?? 0) + value.increment : value;
  }
}
const prisma = {
  zapRun: {
    findMany: async ({ where }) => runs
      .filter((r) => r.status === where.status)
      .map((r) => ({ ...r, recoveryAttempts: attempts(r), stepExecutions: [...(r.stepExecutions || [])].sort((a, b) => a.createdAt - b.createdAt) })),
    // Conditional update, like Postgres: only rows matching id, status AND (if given) the
    // attempt count change - in one step, so two callers can't both match the same count.
    updateMany: async ({ where, data }) => {
      const matched = runs.filter((r) => r.id === where.id && statusMatches(r.status, where)
        && (where.recoveryAttempts === undefined || attempts(r) === where.recoveryAttempts));
      for (const r of matched) applyData(r, data);
      return { count: matched.length };
    },
    findUnique: async ({ where }) => {
      const run = runs.find((r) => r.id === where.id);
      return run && { ...run, zapId: run.zapId || "z1", zap: { id: "z1", userId: "u1", zapName: "Follow up" } };
    },
  },
  stepExecution: {
    updateMany: async ({ where, data }) => {
      const run = runs.find((r) => r.id === where.zapRunId);
      const matched = (run?.stepExecutions || []).filter((e) => statusMatches(e.status, where));
      for (const e of matched) Object.assign(e, data);
      return { count: matched.length };
    },
  },
  alert: { create: async ({ data }) => { alerts.push(data); return data; } },
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
  alerts = [];
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
  assert.deepEqual(job.data, { zapRunId: "r1", resumeAfterStepId: "d1" }, "no attempt count in the job data any more");
  assert.equal(runs[0].recoveryAttempts, 1, "the attempt is counted in Postgres");
});

test(`after ${MAX_RECOVERY_ATTEMPTS} recovery attempts the run is marked FAILED, with completedAt and a visible alert`, async () => {
  runs = [runningRun("r1", [actionExec("s1", ago(20 * MIN), { status: "RUNNING" }), delayExec("d1", ago(10 * MIN), 60)])];
  runs[0].recoveryAttempts = MAX_RECOVERY_ATTEMPTS;
  queue.put("zap-run-r1-after-d1", "resume-zap-run", { zapRunId: "r1", resumeAfterStepId: "d1" }, "failed");
  const result = await sweep();

  assert.equal(result.r1, "gave-up");
  assert.equal(queue.adds.length, 0, "not re-queued again");
  assert.equal(runs[0].status, "FAILED");
  assert.equal(runs[0].completedAt.getTime(), NOW);
  assert.equal(runs[0].stepExecutions[0].status, "FAILED", "the unfinished step is failed too");
  assert.match(runs[0].stepExecutions[0].error, /couldn't restart this run/);
  assert.equal(alerts.length, 1);
  assert.deepEqual({ userId: alerts[0].userId, zapId: alerts[0].zapId, zapRunId: alerts[0].zapRunId }, { userId: "u1", zapId: "z1", zapRunId: "r1" });
  assert.match(alerts[0].message, /Zap "Follow up" failed: Flowline couldn't restart this run after 3 attempts/);

  // A FAILED run is never swept again.
  assert.deepEqual(await sweep(), {});
});

test("giving up never overwrites a run that finished in the meantime", async () => {
  // The sweep read the run as RUNNING; by the time it gives up, the run has SUCCEEDED.
  runs = [runningRun("r1", [delayExec("d1", ago(10 * MIN), 60)])];
  runs[0].recoveryAttempts = MAX_RECOVERY_ATTEMPTS;
  queue.put("zap-run-r1-after-d1", "resume-zap-run", { zapRunId: "r1", resumeAfterStepId: "d1" }, "failed");
  const realFindMany = prisma.zapRun.findMany;
  prisma.zapRun.findMany = async (args) => {
    const snapshot = await realFindMany(args);
    if (args.where.status === "RUNNING") runs[0].status = "SUCCESS"; // finishes right after the read
    return snapshot;
  };
  try {
    const result = await sweep();
    assert.equal(result.r1, "gave-up-already-finished");
  } finally {
    prisma.zapRun.findMany = realFindMany;
  }
  assert.equal(runs[0].status, "SUCCESS");
  assert.equal(runs[0].completedAt, undefined);
  assert.equal(alerts.length, 0);
});

test("a QUEUED run whose job keeps failing is failed the same way", async () => {
  runs = [{ id: "q1", status: "QUEUED", createdAt: ago(MIN), stepExecutions: [], recoveryAttempts: MAX_RECOVERY_ATTEMPTS }];
  queue.put("zap-run-q1", "execute-zap-run", { zapRunId: "q1" }, "failed");
  assert.equal((await sweep()).q1, "gave-up");
  assert.equal(runs[0].status, "FAILED");
  assert.equal(alerts.length, 1);
});

// ── Attempt counter in Postgres (ZapRun.recoveryAttempts) ──
const STALE = NOW + STALE_AFTER_MS; // a "now" at which every run below counts as quiet
const lostRunningRun = (id) => runningRun(id, [actionExec("s1", ago(30 * MIN), { status: "RUNNING" })]);

test("counter: a missing job (Redis lost it) re-added for a stale run counts, and the count lives in Postgres", async () => {
  runs = [lostRunningRun("r1")];
  assert.equal((await sweep()).r1, "added");
  assert.equal(runs[0].recoveryAttempts, 1);

  queue.jobs.clear(); // Redis restarted: the job - and anything stored in it - is gone
  assert.equal((await sweep({ now: STALE })).r1, "added");
  assert.equal(runs[0].recoveryAttempts, 2, "not reset by the lost job");
});

test("counter: a failed job trimmed by retention before the sweep saw it still counts (no reset to 0)", async () => {
  runs = [runningRun("r1", [delayExec("d1", ago(30 * MIN), 60)])];
  queue.put("zap-run-r1-after-d1", "resume-zap-run", { zapRunId: "r1", resumeAfterStepId: "d1" }, "failed");
  assert.equal((await sweep()).r1, "replaced");
  assert.equal(runs[0].recoveryAttempts, 1);

  queue.jobs.get("zap-run-r1-after-d1").state = "failed"; // failed again...
  queue.jobs.delete("zap-run-r1-after-d1"); // ...and trimmed (removeOnFail count) before the next sweep
  assert.equal((await sweep({ now: STALE })).r1, "added");
  assert.equal(runs[0].recoveryAttempts, 2);
});

test(`counter: the ${MAX_RECOVERY_ATTEMPTS}-attempt limit holds across repeated Redis job deletions, then the run is FAILED once`, async () => {
  runs = [lostRunningRun("r1")];
  const outcomes = [];
  for (let sweepNo = 1; sweepNo <= 5; sweepNo++) {
    queue.jobs.clear(); // the job vanishes every time (Redis restart / deletion / trimming)
    outcomes.push((await sweep({ now: NOW + sweepNo * STALE_AFTER_MS })).r1);
  }
  assert.deepEqual(outcomes, ["added", "added", "added", "gave-up", undefined], "3 attempts, then FAILED, then never swept again");
  assert.equal(queue.adds.length, MAX_RECOVERY_ATTEMPTS);
  assert.equal(runs[0].recoveryAttempts, MAX_RECOVERY_ATTEMPTS);
  assert.equal(runs[0].status, "FAILED");
  assert.equal(alerts.length, 1, "one alert");
});

test("counter: concurrent sweeps (no lock) claim an attempt once and add the job once", async () => {
  runs = [lostRunningRun("r1"), { id: "q1", status: "QUEUED", createdAt: ago(MIN), stepExecutions: [] }];
  const results = await Promise.all([sweep(), sweep(), sweep(), sweep(), sweep()]);
  assert.equal(runs[0].recoveryAttempts, 1, "r1 counted once");
  assert.equal(runs[1].recoveryAttempts, 1, "q1 counted once");
  assert.equal(queue.adds.length, 2, "one add per run");
  assert.equal(results.filter((r) => r.r1 === "added").length, 1);
  assert.equal(results.filter((r) => r.r1 === "claimed-elsewhere").length, 4);
});

test("counter: two claims from the same snapshot - exactly one wins (compare-and-set)", async () => {
  runs = [lostRunningRun("r1")];
  const snapshot = { id: "r1", recoveryAttempts: 0 };
  const claims = await Promise.all([claimRecoveryAttempt(prisma, snapshot), claimRecoveryAttempt(prisma, snapshot)]);
  assert.deepEqual(claims.sort(), ["claimed", "lost"]);
  assert.equal(runs[0].recoveryAttempts, 1);
});

test("counter: completed and deleted runs are never claimed, re-queued or marked FAILED", async () => {
  runs = [
    { id: "done", status: "SUCCESS", createdAt: ago(60 * MIN), recoveryAttempts: 0, stepExecutions: [] },
    { id: "spent", status: "SUCCESS", createdAt: ago(60 * MIN), recoveryAttempts: MAX_RECOVERY_ATTEMPTS, stepExecutions: [] },
  ];
  assert.equal(await claimRecoveryAttempt(prisma, { id: "done", recoveryAttempts: 0 }), "lost");
  assert.equal(await claimRecoveryAttempt(prisma, { id: "deleted", recoveryAttempts: 0 }), "lost");
  assert.deepEqual(await sweep({ now: STALE }), {});
  assert.deepEqual(runs.map((r) => [r.status, r.recoveryAttempts]), [["SUCCESS", 0], ["SUCCESS", MAX_RECOVERY_ATTEMPTS]]);
  assert.equal(queue.adds.length + alerts.length, 0);
});

test("counter: a run that finishes between the sweep's read and its claim is left alone (no count, no job)", async () => {
  runs = [lostRunningRun("r1")];
  const realFindMany = prisma.zapRun.findMany;
  prisma.zapRun.findMany = async (args) => {
    const snapshot = await realFindMany(args);
    if (args.where.status === "RUNNING") runs[0].status = "SUCCESS";
    return snapshot;
  };
  try {
    assert.equal((await sweep()).r1, "claimed-elsewhere");
  } finally {
    prisma.zapRun.findMany = realFindMany;
  }
  assert.equal(runs[0].recoveryAttempts ?? 0, 0);
  assert.equal(runs[0].status, "SUCCESS");
  assert.equal(queue.adds.length, 0);
});

test("counter: a Delay's resume job lost BEFORE its resume time is re-added without using an attempt", async () => {
  runs = [runningRun("r1", [delayExec("d1", ago(MIN), 3600)])]; // resumes in 59 min
  for (let restart = 0; restart < 5; restart++) {
    queue.jobs.clear(); // Redis restarts while the run waits
    assert.equal((await sweep()).r1, "added");
  }
  assert.equal(runs[0].recoveryAttempts ?? 0, 0, "waiting out a Delay through Redis restarts costs nothing");
  assert.equal(queue.jobs.get("zap-run-r1-after-d1").delay, 59 * MIN);

  // After the resume time, a missing resume job may have run - that does count.
  queue.jobs.clear();
  assert.equal((await sweep({ now: NOW + 60 * MIN + STALE_AFTER_MS })).r1, "added");
  assert.equal(runs[0].recoveryAttempts, 1);
});

test("crash window: the attempt is claimed BEFORE the job is added - a failure in between uses it up (conservative), never exceeds the limit", async () => {
  runs = [lostRunningRun("r1")];
  const realAdd = queue.add;
  queue.add = async () => { throw new Error("Redis connection lost"); }; // or the process dies here
  await assert.rejects(sweep(), /Redis connection lost/);
  assert.equal(runs[0].recoveryAttempts, 1, "attempt 1 is spent although no job was added");
  assert.equal(queue.jobs.size, 0);

  queue.add = realAdd;
  assert.equal((await sweep({ now: STALE })).r1, "added");
  assert.equal(runs[0].recoveryAttempts, 2, "the next sweep re-queues it as attempt 2");
});

// ── Grace period for brand-new QUEUED runs (saved, first job not added yet) ──
const queuedRun = (id, ageMs) => ({ id, status: "QUEUED", createdAt: ago(ageMs), stepExecutions: [] });

test("grace: the period is 60 seconds", () => {
  assert.equal(QUEUED_GRACE_MS, 60_000);
});

test("grace: a QUEUED run 59.999 s old with no job is left alone - no job added, no attempt used", async () => {
  runs = [queuedRun("q1", QUEUED_GRACE_MS - 1)];
  assert.equal((await sweep()).q1, "recent");
  assert.equal(queue.adds.length, 0);
  assert.equal(runs[0].recoveryAttempts ?? 0, 0);
});

test("grace: at exactly 60 s (and after) normal recovery applies - the job is added and the attempt counted", async () => {
  runs = [queuedRun("q60", QUEUED_GRACE_MS), queuedRun("q61", QUEUED_GRACE_MS + 1)];
  assert.deepEqual(await sweep(), { q60: "added", q61: "added" });
  assert.deepEqual(runs.map((r) => r.recoveryAttempts), [1, 1]);
});

test("grace: the producer's race - a sweep between saving the run and queueing its job costs nothing", async () => {
  runs = [queuedRun("q1", 50)]; // the API just saved it...
  assert.equal((await sweep()).q1, "recent"); // ...the sweep runs right then...
  await queue.add("execute-zap-run", { zapRunId: "q1" }, { jobId: "zap-run-q1" }); // ...then the API queues it
  assert.equal((await sweep({ now: NOW + 2 * QUEUED_GRACE_MS })).q1, "pending");
  assert.equal(runs[0].recoveryAttempts ?? 0, 0);
  assert.equal(queue.jobs.size, 1);
});

test("grace: does not delay a young QUEUED run whose job FAILED (replaced and counted as before)", async () => {
  runs = [queuedRun("q1", 5_000)];
  queue.put("zap-run-q1", "execute-zap-run", { zapRunId: "q1" }, "failed");
  assert.equal((await sweep()).q1, "replaced");
  assert.equal(runs[0].recoveryAttempts, 1);
});

test("grace: a young QUEUED run's waiting job or completed job is handled as before", async () => {
  runs = [queuedRun("waiting", 5_000), queuedRun("done", 5_000)];
  queue.put("zap-run-waiting", "execute-zap-run", { zapRunId: "waiting" }, "waiting");
  queue.put("zap-run-done", "execute-zap-run", { zapRunId: "done" }, "completed");
  assert.deepEqual(await sweep(), { waiting: "pending", done: "kept-finished" });
});

test("grace: not applied to Delay resume jobs - a just-started run's lost resume job is re-added at once (free)", async () => {
  runs = [runningRun("r1", [delayExec("d1", ago(2_000), 600)], ago(5_000))]; // run 5 s old, waiting 10 min
  assert.equal((await sweep()).r1, "added");
  assert.equal(queue.jobs.get("zap-run-r1-after-d1").delay, 598_000);
  assert.equal(runs[0].recoveryAttempts ?? 0, 0);
});

test("grace: not applied to RUNNING runs - a quiet RUNNING run created long ago but with a lost job is recovered as before", async () => {
  runs = [lostRunningRun("r1")];
  assert.equal((await sweep()).r1, "added");
  assert.equal(runs[0].recoveryAttempts, 1);
});

// ── Job retention: trimmed (missing) finished jobs ──
test("retention trimmed a finished resume job while the run still waits at the Delay: handled like completed (recent: left; stale: re-added)", async () => {
  runs = [runningRun("r1", [delayExec("d1", ago(3 * MIN), 60)])]; // due 2 min ago, its job is gone
  assert.equal((await sweep()).r1, "recent");
  assert.equal(queue.adds.length, 0);
  assert.equal((await sweep({ now: NOW + STALE_AFTER_MS })).r1, "added");
});

test("retention trimmed the job of a finished run: nothing is re-queued (so it can't run again)", async () => {
  runs = [
    { id: "done", status: "SUCCESS", createdAt: ago(2 * 24 * 60 * MIN), stepExecutions: [actionExec("s1", ago(2 * 24 * 60 * MIN))] },
    { id: "failed", status: "FAILED", createdAt: ago(2 * 24 * 60 * MIN), stepExecutions: [] },
    { id: "filtered", status: "FILTERED", createdAt: ago(2 * 24 * 60 * MIN), stepExecutions: [] },
  ];
  assert.deepEqual(await sweep(), {});
  assert.equal(queue.adds.length, 0);
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
  // The scheduler uses the real clock, so the run's age is relative to it (past the grace period).
  runs = [{ id: "q1", status: "QUEUED", createdAt: new Date(Date.now() - 2 * MIN) }];
  const scheduler = startRecoveryScheduler({ prisma, queue, redis: makeRedis(), intervalMs: 60_000, log });
  const again = scheduler.sweep(); // while the startup sweep runs: same promise, no second sweep
  await again;
  await scheduler.stop();
  assert.equal(queue.adds.length, 1);
  assert.ok(queue.jobs.get("zap-run-q1"));
});
