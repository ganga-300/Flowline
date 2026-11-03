// Legacy generic URL-polling triggers (config.url, no GitHub/Gmail/Slack provider) were
// removed: the poller must skip them without fetching anything, creating runs or moving
// the "last seen" marker. MOCKED: fetch, Prisma, Redis/BullMQ.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const workerSrc = path.join(__dirname, "../src");
function stubModule(request, exports) {
  const resolved = require.resolve(request, { paths: [workerSrc] });
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
const jobs = [];
stubModule("bullmq", { Queue: class { async add(name, data) { jobs.push(data); } } });
stubModule("ioredis", class {});

let triggers, runs, triggerUpdates;
stubModule(path.join(workerSrc, "prismaClient"), {
  trigger: {
    findMany: async () => triggers,
    update: async ({ data }) => { triggerUpdates.push(data); },
  },
  zapRun: { create: async ({ data }) => { const r = { id: `run_${runs.length + 1}`, ...data }; runs.push(r); return r; } },
});

const { runPollingCycle, pollSingleTrigger } = require("../src/pollingCron");

const legacyTriggers = () => [
  { id: "t_meta", zapId: "z1", type: "POLLING", lastPollHash: null, config: { url: "http://169.254.169.254/latest/meta-data/" } },
  { id: "t_local", zapId: "z2", type: "POLLING", lastPollHash: "abc", config: { url: "http://127.0.0.1:6379/", headers: { Host: "internal" } } },
  { id: "t_public", zapId: "z3", type: "POLLING", lastPollHash: null, config: { provider: "http", url: "https://api.example.com/feed" } },
];

let realFetch, fetchCalls, warnings, realWarn;
beforeEach(() => {
  triggers = legacyTriggers();
  runs = [];
  triggerUpdates = [];
  jobs.length = 0;
  fetchCalls = [];
  warnings = [];
  realFetch = global.fetch;
  global.fetch = async (url) => {
    fetchCalls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ secret: "internal data" }) };
  };
  realWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
});
afterEach(() => {
  global.fetch = realFetch;
  console.warn = realWarn;
});

test("polling cycle skips legacy URL-polling triggers: no fetch, no run, no marker change", async () => {
  await runPollingCycle();
  assert.deepEqual(fetchCalls, []);
  assert.equal(runs.length, 0);
  assert.equal(jobs.length, 0);
  assert.deepEqual(triggerUpdates, []);
  assert.equal(warnings.filter((w) => w.includes("unsupported provider")).length, 3);
  assert.ok(warnings.some((w) => w.includes("t_meta") && w.includes("z1")), "warning names the trigger and Zap");
});

test("manual run (pollSingleTrigger) of a legacy URL-polling trigger fetches and runs nothing", async () => {
  for (const trigger of legacyTriggers()) {
    await pollSingleTrigger(trigger);
  }
  assert.deepEqual(fetchCalls, []);
  assert.equal(runs.length, 0);
  assert.deepEqual(triggerUpdates, []);
});

test("the generic poller is no longer exported", () => {
  assert.equal(require("../src/pollingCron").pollGenericHttpTrigger, undefined);
});
