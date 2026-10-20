// POST /zaps/:id/runs/:runId/retry - "retry from failed step" vs "run all steps again".
// MOCKED: Prisma and the queue are in-memory fakes; no database, Redis or network.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.JWT_SECRET = "test-secret";
function stub(file, exports) {
  const resolved = require.resolve(file);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

let runs;
let queued;
beforeEach(() => {
  runs = [
    { id: "r_failed", zapId: "z1", status: "FAILED", triggerPayload: { n: 1 } },
    { id: "r_ok", zapId: "z1", status: "SUCCESS", triggerPayload: { n: 2 } },
  ];
  queued = [];
});
stub(path.join(__dirname, "../src/prismaClient.js"), {
  zap: { findFirst: async ({ where }) => (where.id === "z1" && where.userId === "alice" ? { id: "z1", userId: "alice" } : null) },
  zapRun: {
    findFirst: async ({ where }) => runs.find((r) => r.id === where.id && r.zapId === where.zapId) || null,
    create: async ({ data }) => { const row = { id: `r_new_${runs.length}`, ...data }; runs.push(row); return row; },
  },
});
stub(path.join(__dirname, "../src/Queue.js"), { zapExecutionQueue: { add: async (name, data, opts) => queued.push(opts.jobId) } });

const zapsRouter = require("../src/routes/zaps");
const retry = zapsRouter.stack.find((l) => l.route?.path === "/:id/runs/:runId/retry").route.stack.at(-1).handle;

async function call(runId, body) {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await retry({ params: { id: "z1", runId }, userId: "alice", body }, res);
  return res;
}

test("a failed run retries from the failed step by default", async () => {
  const res = await call("r_failed", {});
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.mode, "resume");
  const created = runs.find((r) => r.id === res.body.runId);
  assert.equal(created.retryOfRunId, "r_failed");
  assert.deepEqual(created.triggerPayload, { n: 1 });
  assert.deepEqual(queued, [`zap-run-${created.id}`]);
});

test('"all" re-runs every step: no link to the original run', async () => {
  const res = await call("r_failed", { mode: "all" });
  assert.equal(res.body.mode, "all");
  assert.equal(runs.find((r) => r.id === res.body.runId).retryOfRunId, undefined);
});

test("a run that didn't fail is always re-run in full", async () => {
  const res = await call("r_ok", { mode: "resume" });
  assert.equal(res.body.mode, "all");
  assert.equal(runs.find((r) => r.id === res.body.runId).retryOfRunId, undefined);
});

test("an unknown mode is rejected", async () => {
  const res = await call("r_failed", { mode: "everything" });
  assert.equal(res.statusCode, 400);
  assert.equal(queued.length, 0);
});

test("another user's run can't be retried", async () => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() { return this; } };
  await retry({ params: { id: "z1", runId: "r_failed" }, userId: "bob", body: {} }, res);
  assert.equal(res.statusCode, 404);
});
