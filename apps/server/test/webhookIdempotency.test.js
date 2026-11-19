// POST /webhooks/:token - one run and one job per event, even across a crash.
// MOCKED: Prisma (in-memory) and the BullMQ queue (ignores duplicate job ids like BullMQ).
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function stub(file, exports) {
  const resolved = require.resolve(file);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
let runs, jobs, queueDown;
stub(path.join(__dirname, "../src/prismaClient.js"), {
  trigger: { findUnique: async () => ({ id: "t1", zapId: "z1", zap: { status: "ENABLED" } }) },
  zapRun: {
    create: async ({ data }) => {
      if (runs.some((r) => r.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error("dup"), { code: "P2002" });
      const r = { id: `run_${runs.length + 1}`, ...data }; runs.push(r); return r;
    },
    findUnique: async ({ where }) => runs.find((r) => r.idempotencyKey === where.idempotencyKey) || null,
  },
});
stub(path.join(__dirname, "../src/Queue.js"), { zapExecutionQueue: { add: async (n, d, o) => {
  if (queueDown) throw new Error("redis down");
  if (!jobs.has(o?.jobId)) jobs.set(o?.jobId, d);
} } });

const handler = require("../src/routes/webhooks").stack.find((l) => l.route?.path === "/:token").route.stack.at(-1).handle;
async function post(body) {
  const out = {};
  await handler({ params: { token: "tok" }, body }, { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } });
  return out;
}
beforeEach(() => { runs = []; jobs = new Map(); queueDown = false; });

test("new event: one run, queued once", async () => {
  const out = await post({ id: 1 });
  assert.equal(out.status, 202);
  assert.equal(runs.length, 1);
  assert.deepEqual([...jobs.keys()], [`zap-run-${runs[0].id}`]);
});

test("same event delivered twice: still one run and one job", async () => {
  await post({ id: 1 });
  const again = await post({ id: 1 });
  assert.equal(again.body.duplicate, true);
  assert.equal(runs.length, 1);
  assert.equal(jobs.size, 1);
});

test("queue failed after the run was saved: the provider's retry queues it", async () => {
  queueDown = true;
  await post({ id: 1 }).catch(() => {});
  assert.equal(runs.length, 1);
  assert.equal(jobs.size, 0);
  queueDown = false;
  await post({ id: 1 });
  assert.equal(jobs.size, 1, "the saved-but-unqueued run is queued on redelivery");
});

// ── Bodies other than JSON, and what counts as "the same event" ──

const { webhookPayload, webhookIdempotencyKey, deliveryId, DEDUPE_WINDOW_MS } = require("../src/lib/webhookDelivery");

async function postWith(req) {
  const out = {};
  await handler({ params: { token: "tok" }, ...req }, { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } });
  return out;
}

test("form posts, plain text and empty bodies are accepted (no crash)", async () => {
  assert.equal((await postWith({ body: { name: "Ana", plan: "pro" } })).status, 202); // urlencoded, parsed
  assert.equal((await postWith({ body: "hello" })).status, 202);
  assert.equal((await postWith({})).status, 202); // no body at all: req.body is undefined
  assert.deepEqual(runs.map((r) => r.triggerPayload), [{ name: "Ana", plan: "pro" }, { text: "hello" }, {}]);
});

test("webhookPayload: JSON as sent, text as { text }, empty as {}", () => {
  assert.deepEqual(webhookPayload({ a: 1 }), { a: 1 });
  assert.deepEqual(webhookPayload([1, 2]), [1, 2]);
  assert.deepEqual(webhookPayload("hi"), { text: "hi" });
  assert.deepEqual(webhookPayload("   "), {});
  assert.deepEqual(webhookPayload(undefined), {});
  assert.deepEqual(webhookPayload(Buffer.from("x")), { text: "x" });
});

test("identical events with different delivery ids both run; a redelivery with the same id doesn't", async () => {
  await postWith({ body: { event: "push" }, headers: { "x-github-delivery": "d-1" } });
  await postWith({ body: { event: "push" }, headers: { "x-github-delivery": "d-2" } });
  const again = await postWith({ body: { event: "push" }, headers: { "x-github-delivery": "d-1" } });
  assert.equal(runs.length, 2);
  assert.equal(again.body.duplicate, true);
});

test("without a delivery id, an identical body only dedupes within a short window", () => {
  const t0 = 1_700_000_000_000 - (1_700_000_000_000 % DEDUPE_WINDOW_MS);
  const key = (now) => webhookIdempotencyKey("t1", { headers: {}, payload: { a: 1 }, now });
  assert.equal(key(t0), key(t0 + 60_000), "a quick retry is the same event");
  assert.notEqual(key(t0), key(t0 + DEDUPE_WINDOW_MS), "the same body later is a new event");
  assert.notEqual(key(t0), webhookIdempotencyKey("t1", { headers: {}, payload: { a: 2 }, now: t0 }));
});

test("delivery id headers: the common ones are recognised; the key never contains the raw id", () => {
  assert.equal(deliveryId({ "idempotency-key": " abc " }), "abc");
  assert.equal(deliveryId({ "x-request-id": "r1" }), "r1");
  assert.equal(deliveryId({ "webhook-id": "msg_1" }), "msg_1");
  assert.equal(deliveryId({ "content-type": "application/json" }), null);
  const key = webhookIdempotencyKey("t1", { headers: { "idempotency-key": "secret-ish" }, payload: {} });
  assert.match(key, /^t1-delivery-[0-9a-f]{64}$/);
});

// ── JSON errors instead of HTML pages ──

const { jsonErrorHandler, notFoundHandler } = require("../src/middleware/errors");
function runErrorHandler(err) {
  const out = {};
  const res = { headersSent: false, status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  const realError = console.error;
  console.error = () => {};
  try {
    jsonErrorHandler(err, { method: "POST", url: "/webhooks/tok" }, res, () => {});
  } finally {
    console.error = realError;
  }
  return out;
}

test("malformed JSON gets a JSON 400, not an HTML page with a stack trace", () => {
  const out = runErrorHandler(Object.assign(new SyntaxError("Unexpected token"), { type: "entity.parse.failed", status: 400 }));
  assert.equal(out.status, 400);
  assert.deepEqual(out.body, { error: "The request body isn't valid JSON." });
});

test("unexpected errors get a JSON 500 without internals", () => {
  const out = runErrorHandler(new Error("connect ECONNREFUSED 127.0.0.1:5432 at /Users/x/app.js"));
  assert.equal(out.status, 500);
  assert.doesNotMatch(JSON.stringify(out.body), /ECONNREFUSED|Users/);
});

test("unknown endpoints get a JSON 404", () => {
  const out = {};
  notFoundHandler({ method: "GET", path: "/nope" }, { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } });
  assert.equal(out.status, 404);
  assert.match(out.body.error, /GET \/nope/);
});
