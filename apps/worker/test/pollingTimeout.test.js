// A provider that never answers must not block polling: the stuck trigger is skipped after
// the time limit, the other triggers in the cycle are still polled, and later cycles run.
// MOCKED: fetch, Prisma, Redis/BullMQ. AbortSignal.timeout is shortened to 30 ms.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const workerSrc = path.join(__dirname, "../src");
function stubModule(request, exports) {
  const resolved = require.resolve(request, { paths: [workerSrc] });
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
stubModule("bullmq", { Queue: class { async add() {} } });
stubModule("ioredis", class {});

const triggers = () => [
  { id: "t_hang", zapId: "z1", type: "POLLING", lastPollHash: "n:1", connection: null, config: { provider: "github", event: "new_issue", repo: "octo/hangs" } },
  { id: "t_ok", zapId: "z2", type: "POLLING", lastPollHash: "n:1", connection: null, config: { provider: "github", event: "new_issue", repo: "octo/fine" } },
];
let markerUpdates;
stubModule(path.join(workerSrc, "prismaClient"), {
  trigger: { findMany: async () => triggers(), update: async ({ data }) => { markerUpdates.push(data); } },
  zapRun: { create: async () => { throw new Error("no runs expected"); } },
});

const { runPollingCycle, pollSingleTrigger, startPollingScheduler, stopPollingScheduler, waitForPollingCycle } = require("../src/pollingCron");

const realTimeout = AbortSignal.timeout;
const realFetch = global.fetch;
let fetchCalls, requestedTimeouts, keepAlive;

beforeEach(() => {
  // AbortSignal.timeout's timer doesn't keep Node alive; a real hanging request holds an
  // open socket that does. The fake request holds nothing, so keep the test process alive.
  keepAlive = setInterval(() => {}, 1000);
  fetchCalls = [];
  requestedTimeouts = [];
  markerUpdates = [];
  AbortSignal.timeout = (ms) => { requestedTimeouts.push(ms); return realTimeout.call(AbortSignal, 30); };
  global.fetch = async (url, init) => {
    fetchCalls.push(String(url));
    if (String(url).includes("octo/hangs")) {
      return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }));
    }
    return { ok: true, status: 200, json: async () => [] }; // no issues
  };
});
afterEach(() => {
  clearInterval(keepAlive);
  AbortSignal.timeout = realTimeout;
  global.fetch = realFetch;
});

// Requests for the issue list (each poll also checks the next issue number, which isn't counted).
const polled = (repo) => fetchCalls.filter((u) => u.includes(repo) && u.includes("/issues?")).length;

test("a hanging provider times out and the rest of the cycle still runs", async () => {
  const started = Date.now();
  await runPollingCycle();
  assert.ok(Date.now() - started < 2000, "cycle finished");
  assert.equal(polled("octo/hangs"), 1);
  assert.equal(polled("octo/fine"), 1, "the next trigger was still polled");
  assert.deepEqual(markerUpdates, [], "no marker moved for the timed-out trigger");
  assert.ok(requestedTimeouts.every((ms) => ms === 15_000));
});

test("the scheduler is not blocked: after a timed-out cycle the next cycle runs", async () => {
  startPollingScheduler(60_000); // first cycle starts immediately
  await waitForPollingCycle();
  stopPollingScheduler();
  assert.equal(polled("octo/fine"), 1);

  startPollingScheduler(60_000);
  await waitForPollingCycle();
  stopPollingScheduler();
  assert.equal(polled("octo/hangs"), 2, "second cycle ran (the cycle lock was released)");
  assert.equal(polled("octo/fine"), 2);
});

test("manual Run on a hanging trigger reports a timeout instead of hanging", async () => {
  await assert.rejects(pollSingleTrigger(triggers()[0]), /api\.github\.com timed out after 15s/);
});
