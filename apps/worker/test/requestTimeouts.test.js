// Request timeouts: a provider that never answers must fail the step (and the run) after
// the time limit instead of holding the worker, and must not be re-sent automatically.
// MOCKED: fetch (a request that never answers), Prisma, Redis/BullMQ, the polling engine.
// AbortSignal.timeout is shortened to 30 ms so tests don't wait 15 s; the requested
// limit is recorded and checked.
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
  Queue: class { async add() {} async close() {} },
});
stubModule("ioredis", class { async quit() {} });
stubModule(path.join(workerSrc, "pollingCron"), {
  startPollingScheduler: () => {},
  stopPollingScheduler: () => {},
  waitForPollingCycle: async () => {},
});

let db;
const prisma = {
  zapRun: {
    findUnique: async () => db.run,
    findMany: async () => [],
    update: async ({ data }) => { Object.assign(db.run, data); return db.run; },
  },
  step: { findMany: async () => db.steps },
  stepExecution: {
    count: async () => 0,
    findMany: async () => [],
    create: async ({ data }) => { const e = { id: `e${db.executions.length + 1}`, ...data }; db.executions.push(e); return e; },
    update: async ({ where, data }) => Object.assign(db.executions.find((e) => e.id === where.id), data),
  },
  connection: { findUnique: async () => ({ id: "c1", provider: "slack:T", accessToken: "xoxb-fake" }) },
  zap: { findUnique: async () => ({ id: "z1", userId: "u1", zapName: "Notify" }) },
  alert: { create: async ({ data }) => { db.alerts.push(data); return data; } },
};
stubModule(path.join(workerSrc, "prismaClient"), prisma);

const { fetchWithTimeout, REQUEST_TIMEOUT_MS } = require("../src/fetchWithTimeout");
const { isRetryable, runWithRetry } = require("../src/recovery");

// ── Never-answering provider + short timeouts ──
const realTimeout = AbortSignal.timeout;
const realFetch = global.fetch;
let requestedTimeouts, fetchCalls, keepAlive;
const hangingFetch = async (url, init) => {
  fetchCalls.push(String(url));
  return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }));
};

beforeEach(() => {
  requestedTimeouts = [];
  fetchCalls = [];
  AbortSignal.timeout = (ms) => { requestedTimeouts.push(ms); return realTimeout.call(AbortSignal, 30); };
  global.fetch = hangingFetch;
  // AbortSignal.timeout's timer doesn't keep Node alive; a real hanging request holds an
  // open socket that does. The fake request holds nothing, so keep the test process alive.
  keepAlive = setInterval(() => {}, 1000);
});
afterEach(() => {
  clearInterval(keepAlive);
  AbortSignal.timeout = realTimeout;
  global.fetch = realFetch;
});

// ── The helper ──
test("every request gets a 15 s limit", async () => {
  global.fetch = async (url, init) => ({ ok: true, signal: init.signal });
  const res = await fetchWithTimeout("https://api.github.com/user");
  assert.equal(REQUEST_TIMEOUT_MS, 15_000);
  assert.deepEqual(requestedTimeouts, [15_000]);
  assert.ok(res.signal instanceof AbortSignal);
});

test("a request that never answers fails with a clear, non-retryable timeout error", async () => {
  const started = Date.now();
  await assert.rejects(fetchWithTimeout("https://slack.com/api/chat.postMessage?token=secret"), (err) => {
    assert.equal(err.timedOut, true);
    assert.equal(err.retryable, false);
    assert.equal(err.message, "Request to slack.com timed out after 15s.");
    assert.ok(!err.message.includes("secret"), "no query string in the message");
    assert.equal(err.cause.name, "TimeoutError");
    return true;
  });
  assert.ok(Date.now() - started < 2000);
  assert.equal(isRetryable(await fetchWithTimeout("https://x.test").catch((e) => e)), false);
});

test("other network errors are passed through unchanged (retry rules unchanged)", async () => {
  const refused = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
  global.fetch = async () => { throw refused; };
  const err = await fetchWithTimeout("https://api.github.com/user").catch((e) => e);
  assert.equal(err, refused);
  assert.equal(isRetryable(err), true, "connection never established is still retried");
});

test("a timed-out step is attempted once - never re-sent by the retry wrapper", async () => {
  let attempts = 0;
  await assert.rejects(runWithRetry(async () => { attempts++; await fetchWithTimeout("https://gmail.googleapis.com/x"); }, { sleep: async () => {} }), /timed out/);
  assert.equal(attempts, 1);
});

// ── A whole run in the worker ──
require("../src/index"); // registers the BullMQ processor (captured as processJob)

test("worker: a Slack step that times out fails the step and the run (not left RUNNING), with an alert", async () => {
  db = {
    run: { id: "r1", zapId: "z1", status: "QUEUED", triggerPayload: { body: { text: "hi" } }, retryOfRunId: null, startedAt: null },
    steps: [{ id: "s1", zapId: "z1", type: "ACTION", name: "Slack", order: 0, parentStepId: null, connectionId: "c1", config: { provider: "slack", action: "send_message", channel: "C1", text: "{{trigger.body.text}}" } }],
    executions: [],
    alerts: [],
  };

  await processJob({ id: "job1", data: { zapRunId: "r1" } });

  assert.equal(db.run.status, "FAILED");
  assert.ok(db.run.completedAt instanceof Date);
  assert.equal(db.executions.length, 1);
  assert.equal(db.executions[0].status, "FAILED");
  assert.match(db.executions[0].error, /slack\.com timed out after 15s/);
  assert.equal(fetchCalls.length, 1, "the message was not re-sent");
  assert.equal(db.alerts.length, 1);
  assert.match(db.alerts[0].message, /timed out/);
});

test("worker: the next job runs normally after a timeout", async () => {
  global.fetch = async (url, init) => { fetchCalls.push(String(url)); return { ok: true, json: async () => ({ ok: true, ts: "1.2" }) }; };
  db = {
    run: { id: "r2", zapId: "z1", status: "QUEUED", triggerPayload: {}, retryOfRunId: null, startedAt: null },
    steps: [{ id: "s1", zapId: "z1", type: "ACTION", name: "Slack", order: 0, parentStepId: null, connectionId: "c1", config: { provider: "slack", action: "send_message", channel: "C1", text: "hello" } }],
    executions: [],
    alerts: [],
  };
  await processJob({ id: "job2", data: { zapRunId: "r2" } });
  assert.equal(db.run.status, "SUCCESS");
  assert.equal(db.executions[0].status, "SUCCESS");
});

test("worker: an AI step that times out fails cleanly", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  db = {
    run: { id: "r3", zapId: "z1", status: "QUEUED", triggerPayload: {}, retryOfRunId: null, startedAt: null },
    steps: [{ id: "s_ai", zapId: "z1", type: "AI", name: "AI", order: 0, parentStepId: null, config: { prompt: "hi" } }],
    executions: [],
    alerts: [],
  };
  try {
    await processJob({ id: "job3", data: { zapRunId: "r3" } });
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
  assert.equal(db.run.status, "FAILED");
  assert.match(db.executions[0].error, /openrouter\.ai timed out/);
  assert.equal(fetchCalls.length, 1);
});
