// Delay steps in the worker's job handler: a crash between recording a Delay and scheduling its
// resume doesn't restart the wait; a resume rebuilt by the recovery sweep finishes the run; a
// resume whose Delay step was removed fails clearly instead of "succeeding" with nothing run.
// MOCKED: Prisma (in-memory), BullMQ (captures the processor; queue records adds), Redis,
// the polling engine, and Slack (global.fetch).
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test";

const workerSrc = path.join(__dirname, "../src");
function stubModule(request, exports) {
  const resolved = require.resolve(request, { paths: [workerSrc] });
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// ── Fakes ──
let processJob;
let queued; // jobs the worker / sweep added, by id
stubModule("bullmq", {
  Worker: class { constructor(name, fn) { processJob = fn; } on() {} async close() {} },
  Queue: class {
    async add(name, data, opts) { if (!queued.has(opts.jobId)) queued.set(opts.jobId, { name, data, opts, state: opts.delay > 0 ? "delayed" : "waiting" }); }
    async getJob(id) { const j = queued.get(id); return j && { data: j.data, getState: async () => j.state, remove: async () => queued.delete(id) }; }
    async close() {}
  },
});
stubModule("ioredis", class { async quit() {} async set() { return "OK"; } async get() { return null; } async del() {} });
stubModule(path.join(workerSrc, "pollingCron"), { startPollingScheduler: () => {}, stopPollingScheduler: () => {}, waitForPollingCycle: async () => {} });

let db = { runs: [], steps: [], executions: [], alerts: [] }; // empty for the startup sweep
const stepById = (id) => db.steps.find((s) => s.id === id);
const prisma = {
  zapRun: {
    findUnique: async ({ where }) => db.runs.find((r) => r.id === where.id) || null,
    findMany: async ({ where }) => db.runs.filter((r) => r.status === where.status).map((r) => ({
      ...r,
      stepExecutions: db.executions.filter((e) => e.zapRunId === r.id).sort((a, b) => a.createdAt - b.createdAt)
        .map((e) => ({ ...e, step: stepById(e.stepId) && { type: stepById(e.stepId).type, config: stepById(e.stepId).config } })),
    })),
    update: async ({ where, data }) => Object.assign(db.runs.find((r) => r.id === where.id), data),
    // The sweep's compare-and-set claim: id + status + attempt count must all match.
    updateMany: async ({ where, data }) => {
      const matched = db.runs.filter((r) => r.id === where.id && where.status.in.includes(r.status)
        && (where.recoveryAttempts === undefined || (r.recoveryAttempts ?? 0) === where.recoveryAttempts));
      for (const r of matched) {
        if (data.recoveryAttempts?.increment) r.recoveryAttempts = (r.recoveryAttempts ?? 0) + data.recoveryAttempts.increment;
        else Object.assign(r, data);
      }
      return { count: matched.length };
    },
  },
  step: { findMany: async ({ where }) => db.steps.filter((s) => s.zapId === where.zapId) },
  stepExecution: {
    count: async ({ where }) => db.executions.filter((e) => e.zapRunId === where.zapRunId).length,
    findMany: async ({ where }) => db.executions.filter((e) => e.zapRunId === where.zapRunId),
    create: async ({ data }) => {
      const now = new Date();
      const e = { id: `e${db.executions.length + 1}`, createdAt: now, updatedAt: now, reusedFromRunId: null, ...data };
      db.executions.push(e);
      return e;
    },
    createMany: async () => {},
    update: async ({ where, data }) => Object.assign(db.executions.find((e) => e.id === where.id), data, { updatedAt: new Date() }),
  },
  connection: { findUnique: async () => ({ id: "c1", provider: "slack:T", accessToken: "xoxb-fake" }) },
  zap: { findUnique: async () => ({ id: "z1", userId: "u1", zapName: "Notify later" }) },
  alert: { create: async ({ data }) => { db.alerts.push(data); return data; } },
};
stubModule(path.join(workerSrc, "prismaClient"), prisma);

const realFetch = global.fetch;
let slackPosts;
beforeEach(() => {
  queued = new Map();
  slackPosts = [];
  global.fetch = async (url, init) => {
    slackPosts.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ ok: true, ts: "1.2" }) };
  };
  db = {
    runs: [{ id: "r1", zapId: "z1", status: "QUEUED", triggerPayload: { body: { name: "Ana" } }, retryOfRunId: null, startedAt: null, createdAt: new Date() }],
    steps: [
      { id: "s1", zapId: "z1", type: "ACTION", name: "Ping", order: 0, parentStepId: null, connectionId: "c1", config: { provider: "slack", action: "send_message", channel: "C1", text: "before" } },
      { id: "d1", zapId: "z1", type: "DELAY", name: "Wait", order: 1, parentStepId: null, config: { seconds: 60 } },
      { id: "s2", zapId: "z1", type: "ACTION", name: "Follow up", order: 2, parentStepId: null, connectionId: "c1", config: { provider: "slack", action: "send_message", channel: "C1", text: "after {{trigger.body.name}}" } },
    ],
    executions: [],
    alerts: [],
  };
});
afterEach(() => { global.fetch = realFetch; });

require("../src/index"); // registers the job handler (startup sweep runs against the empty fake DB)
const { recoverRuns } = require("../src/runRecovery");
const run = () => db.runs[0];
const delayRows = () => db.executions.filter((e) => e.stepId === "d1");

test("a run reaching a Delay records it once and schedules the full wait under the deterministic id", async () => {
  await processJob({ id: "j1", data: { zapRunId: "r1" } });
  assert.equal(run().status, "RUNNING");
  assert.equal(delayRows().length, 1);
  const resume = queued.get("zap-run-r1-after-d1");
  assert.equal(resume.opts.delay, 60_000);
  assert.deepEqual(resume.data, { zapRunId: "r1", resumeAfterStepId: "d1" });
  assert.equal(slackPosts.length, 1);
});

test("worker crashed after recording the Delay, before scheduling: the re-run keeps the original wait, no second Delay row", async () => {
  // State left by the crash: step 1 sent, Delay recorded 20 s ago, no resume job.
  run().status = "RUNNING";
  run().startedAt = new Date(Date.now() - 25_000);
  const t = new Date(Date.now() - 20_000);
  db.executions.push({ id: "x1", zapRunId: "r1", stepId: "s1", status: "SUCCESS", output: { status: "SENT" }, createdAt: new Date(t - 1000), updatedAt: new Date(t - 1000), reusedFromRunId: null });
  db.executions.push({ id: "x2", zapRunId: "r1", stepId: "d1", status: "SUCCESS", output: { delayedSeconds: 60 }, createdAt: t, updatedAt: t, reusedFromRunId: null });

  await processJob({ id: "zap-run-r1", data: { zapRunId: "r1" } }); // BullMQ re-runs the stalled job
  assert.equal(slackPosts.length, 0, "step 1 not sent again");
  assert.equal(delayRows().length, 1, "no duplicate Delay row");
  const delay = queued.get("zap-run-r1-after-d1").opts.delay;
  assert.ok(delay > 38_000 && delay <= 40_000, `remaining wait ~40 s, got ${delay}`);
});

test("Redis lost the resume job: the sweep rebuilds it and the resumed run finishes the steps after the Delay", async () => {
  await processJob({ id: "j1", data: { zapRunId: "r1" } });
  queued.clear(); // Redis restarted
  // Time passes: the Delay was due long ago and the run has been quiet.
  for (const e of db.executions) { e.createdAt = new Date(Date.now() - 3 * 3600_000); e.updatedAt = e.createdAt; }
  run().createdAt = new Date(Date.now() - 3 * 3600_000);
  run().startedAt = run().createdAt;

  const result = await recoverRuns(prisma, { add: (...a) => queued.set(a[2].jobId, { name: a[0], data: a[1], opts: a[2] }), getJob: async () => undefined }, { log: { log() {}, warn() {}, error() {} } });
  assert.equal(result.r1, "added");
  const rebuilt = queued.get("zap-run-r1-after-d1");
  assert.equal(rebuilt.opts.delay, 0);

  await processJob({ id: "zap-run-r1-after-d1", data: rebuilt.data });
  assert.equal(run().status, "SUCCESS");
  assert.deepEqual(slackPosts.map((p) => p.text), ["before", "after Ana"], "step 1 not re-sent; step 2 sent once");
});

test("resume after a Delay step that was removed from the Zap: the run FAILS with a clear error (not a silent success)", async () => {
  await processJob({ id: "j1", data: { zapRunId: "r1" } });
  db.steps = db.steps.filter((s) => s.id !== "d1"); // edited while waiting
  db.executions = db.executions.filter((e) => e.stepId !== "d1"); // cascade

  await processJob({ id: "zap-run-r1-after-d1", data: { zapRunId: "r1", resumeAfterStepId: "d1" } });
  assert.equal(run().status, "FAILED");
  assert.equal(slackPosts.length, 1, "nothing after the removed Delay was sent");
  assert.match(db.alerts[0].message, /Delay step this run was waiting on was removed/);
});

test("a resume job for a finished or deleted run does nothing", async () => {
  run().status = "SUCCESS";
  await processJob({ id: "zap-run-r1-after-d1", data: { zapRunId: "r1", resumeAfterStepId: "d1" } });
  assert.equal(slackPosts.length, 0);

  db.runs = [];
  await processJob({ id: "zap-run-r1-after-d1", data: { zapRunId: "r1", resumeAfterStepId: "d1" } });
  assert.equal(slackPosts.length, 0);
});
