// Crash recovery inside Loops and Branch paths: a job re-run after a worker crash runs the
// loop iterations that didn't run yet (not just the first), gives each iteration its own
// outputs back, continues a branch path past a step that already succeeded, and refuses a
// Delay nested under another step instead of silently not waiting.
// MOCKED: Prisma (in-memory), BullMQ (captures the processor), Redis, the polling engine,
// and Slack (global.fetch).
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
stubModule("bullmq", {
  Worker: class { constructor(name, fn) { processJob = fn; } on() {} async close() {} },
  Queue: class { async add() {} async getJob() { return undefined; } async close() {} },
});
stubModule("ioredis", class { async quit() {} async set() { return "OK"; } async get() { return null; } async del() {} });
stubModule(path.join(workerSrc, "pollingCron"), { startPollingScheduler: () => {}, stopPollingScheduler: () => {}, waitForPollingCycle: async () => {} });

let db = { runs: [], steps: [], executions: [], alerts: [] }; // empty for the startup sweep
const prisma = {
  zapRun: {
    findUnique: async ({ where }) => db.runs.find((r) => r.id === where.id) || null,
    findMany: async () => [],
    update: async ({ where, data }) => Object.assign(db.runs.find((r) => r.id === where.id), data),
    updateMany: async () => ({ count: 0 }),
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
    update: async ({ where, data }) => Object.assign(db.executions.find((e) => e.id === where.id), data),
  },
  connection: { findUnique: async () => ({ id: "c1", provider: "slack:T", accessToken: "xoxb-fake" }) },
  zap: { findUnique: async () => ({ id: "z1", userId: "u1", zapName: "Loop" }) },
  alert: { create: async ({ data }) => { db.alerts.push(data); return data; } },
};
stubModule(path.join(workerSrc, "prismaClient"), prisma);

const realFetch = global.fetch;
let slackPosts;
beforeEach(() => {
  slackPosts = [];
  global.fetch = async (url, init) => {
    slackPosts.push(JSON.parse(init.body).text);
    return { ok: true, status: 200, json: async () => ({ ok: true, ts: "1.2" }) };
  };
  db = {
    runs: [{ id: "r1", zapId: "z1", status: "RUNNING", triggerPayload: { items: ["a", "b", "c", "d"] }, retryOfRunId: null, startedAt: new Date(), createdAt: new Date() }],
    steps: [],
    executions: [],
    alerts: [],
  };
});
afterEach(() => { global.fetch = realFetch; });

require("../src/index"); // registers the job handler
const run = () => db.runs[0];
const slack = (id, parentStepId, order, text) => ({ id, zapId: "z1", type: "ACTION", name: id, order, parentStepId, connectionId: "c1", config: { provider: "slack", action: "send_message", channel: "C1", text } });
const done = (stepId, output, loopPath) => ({ id: `x-${stepId}-${loopPath}`, zapRunId: "r1", stepId, status: "SUCCESS", output, input: loopPath && { loopPath }, createdAt: new Date(), updatedAt: new Date(), reusedFromRunId: null });

test("crash mid-loop: the re-run sends the iterations that didn't run, and none twice", async () => {
  db.steps = [
    { id: "L", zapId: "z1", type: "LOOP", name: "Each item", order: 0, parentStepId: null, config: { arrayPath: "trigger.items" } },
    slack("s1", "L", 0, "item {{loopItem}}"),
  ];
  // Before the crash: iterations 0 and 1 were sent.
  db.executions.push(done("s1", { status: "SENT" }, [0]), done("s1", { status: "SENT" }, [1]));

  await processJob({ id: "zap-run-r1", data: { zapRunId: "r1" } });
  assert.deepEqual(slackPosts, ["item c", "item d"]);
  assert.equal(run().status, "SUCCESS");
  const recorded = db.executions.filter((e) => e.stepId === "s1").map((e) => e.input.loopPath[0]).sort();
  assert.deepEqual(recorded, [0, 1, 2, 3], "every new execution records its iteration");
});

test("crash between two steps of an iteration: the next step sees that iteration's output", async () => {
  db.steps = [
    { id: "L", zapId: "z1", type: "LOOP", name: "Each item", order: 0, parentStepId: null, config: { arrayPath: "trigger.items" } },
    { id: "f1", zapId: "z1", type: "ACTION", name: "Upper", order: 0, parentStepId: "L", config: { provider: "formatter", action: "capitalize_text", text: "{{loopItem}}", mode: "upper" } },
    slack("s2", "L", 1, "got {{steps.f1.output.result}}"),
  ];
  db.runs[0].triggerPayload = { items: ["a", "b"] };
  // Iteration 0 finished; iteration 1 formatted "B" but hadn't sent yet. Rows come back in
  // no particular order (findMany has no orderBy), so iteration 0's output is listed last.
  db.executions.push(done("f1", { result: "B" }, [1]), done("s2", { status: "SENT" }, [0]), done("f1", { result: "A" }, [0]));

  await processJob({ id: "zap-run-r1", data: { zapRunId: "r1" } });
  assert.deepEqual(slackPosts, ["got B"]);
  assert.equal(run().status, "SUCCESS");
});

test("crash after a step on a branch path: the steps after it on that path still run", async () => {
  db.steps = [
    { id: "b", zapId: "z1", type: "BRANCH", name: "Route", order: 0, parentStepId: null, config: {} },
    slack("p1", "b", 0, "path step 1"), // default path (no branchCondition)
    slack("p2", "p1", 0, "path step 2"),
  ];
  db.executions.push(done("p1", { status: "SENT" }));

  await processJob({ id: "zap-run-r1", data: { zapRunId: "r1" } });
  assert.deepEqual(slackPosts, ["path step 2"]);
  assert.equal(run().status, "SUCCESS");
});

test("a filter that stopped the run before the crash still stops it", async () => {
  db.steps = [
    { id: "f", zapId: "z1", type: "FILTER", name: "Only VIP", order: 0, parentStepId: null, config: { condition: {} } },
    slack("s1", null, 1, "after filter"),
  ];
  db.executions.push(done("f", { passed: false }));

  await processJob({ id: "zap-run-r1", data: { zapRunId: "r1" } });
  assert.deepEqual(slackPosts, []);
  assert.equal(run().status, "FILTERED");
});

test("a Delay nested in a Loop fails the run clearly instead of not waiting", async () => {
  db.steps = [
    { id: "L", zapId: "z1", type: "LOOP", name: "Each item", order: 0, parentStepId: null, config: { arrayPath: "trigger.items" } },
    { id: "d", zapId: "z1", type: "DELAY", name: "Wait", order: 0, parentStepId: "L", config: { seconds: 60 } },
    slack("s1", "L", 1, "after wait"),
  ];
  run().status = "QUEUED";

  await processJob({ id: "zap-run-r1", data: { zapRunId: "r1" } });
  assert.equal(run().status, "FAILED");
  assert.deepEqual(slackPosts, []);
  assert.match(db.alerts[0].message, /Delay step inside a Branch or Loop isn't supported/);
});
