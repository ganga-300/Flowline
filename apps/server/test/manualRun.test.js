// "Run" button (POST /zaps/:id/run) for polling Zaps.
// MOCKED: Prisma, the BullMQ queue and the poller - proves what the route reports
// and that it never runs a polling Zap with fake trigger data. NOT a live poll.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.JWT_SECRET = "test-secret";
function stub(file, exports) {
  const resolved = require.resolve(file);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

let state;
const queued = [];
stub(path.join(__dirname, "../src/Queue.js"), { zapExecutionQueue: { add: async (n, d) => queued.push(d) } });
stub(path.join(__dirname, "../src/prismaClient.js"), {
  zap: { findFirst: async () => state.zap },
  trigger: { findUnique: async () => ({ ...state.trigger }) },
  zapRun: {
    count: async () => state.runs.length,
    findMany: async ({ take }) => state.runs.slice(-take).reverse(),
    create: async ({ data }) => { const r = { id: `manual_${state.runs.length}`, ...data }; state.runs.push(r); return r; },
  },
});
stub(path.join(__dirname, "../../worker/src/pollingCron.js"), {
  pollSingleTrigger: async () => state.poll(),
});

const handler = require("../src/routes/zaps").stack
  .find((l) => l.route?.path === "/:id/run").route.stack.at(-1).handle;

async function run() {
  const out = {};
  await handler({ params: { id: "zap_1" }, userId: "u1", body: { payload: { triggeredBy: "user_click" } } },
    { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } });
  return out;
}

beforeEach(() => {
  queued.length = 0;
  state = {
    zap: { id: "zap_1", userId: "u1", trigger: { id: "t1", type: "POLLING", config: { provider: "github", event: "new_issue" } } },
    trigger: { id: "t1", lastPollHash: "101", config: { provider: "github", event: "new_issue" } },
    runs: [{ id: "old_run" }],
    poll: async () => {},
  };
});

test("new events found: reports how many and returns the new run, not an old one", async () => {
  state.poll = async () => { state.runs.push({ id: "run_new_1" }, { id: "run_new_2" }); };
  const out = await run();
  assert.equal(out.status, 202);
  assert.equal(out.body.newEvents, 2);
  assert.equal(out.body.runId, "run_new_2");
  assert.match(out.body.message, /2 new issues/);
});

test("nothing new: says so and runs nothing", async () => {
  const out = await run();
  assert.equal(out.status ?? 200, 200, "Express default status");
  assert.equal(out.body.runId, null);
  assert.equal(out.body.newEvents, 0);
  assert.match(out.body.message, /No new issues/);
  assert.equal(queued.length, 0);
  assert.equal(state.runs.length, 1, "no fake manual run created");
});

test("first check on a new Zap: explains it only set the starting point", async () => {
  state.trigger.lastPollHash = null;
  state.poll = async () => { state.trigger.lastPollHash = "202"; };
  const out = await run();
  assert.equal(out.body.runId, null);
  assert.match(out.body.message, /[Ff]irst check/);
});

test("provider could not be read: reports it instead of claiming success", async () => {
  state.trigger.lastPollHash = null;
  state.zap.trigger.config = { provider: "slack", event: "new_message" };
  state.trigger.config = state.zap.trigger.config;
  const out = await run();
  assert.equal(out.body.success, false);
  assert.match(out.body.message, /[Cc]ouldn't read/);
});

test("poller throws: returns an error and never runs the Zap with fake trigger data", async () => {
  state.poll = async () => { throw new Error("boom"); };
  const out = await run();
  assert.equal(out.status, 502);
  assert.match(out.body.error, /boom/);
  assert.equal(queued.length, 0);
  assert.equal(state.runs.length, 1);
});

test("webhook Zaps still run immediately with the given payload", async () => {
  state.zap.trigger = { id: "t1", type: "WEBHOOK", config: { provider: "webhook" } };
  const out = await run();
  assert.equal(out.status, 202);
  assert.equal(queued.length, 1);
  assert.deepEqual(state.runs.at(-1).triggerPayload, { triggeredBy: "user_click" });
});
