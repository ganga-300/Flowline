// Slack "New Message" polling: every eligible message after the checkpoint gets exactly one
// run, across pages, and the checkpoint never moves past a message without a run.
// MOCKED: Slack Web API (an in-memory channel that honours oldest/limit/cursor like
// conversations.history), Prisma, Redis/BullMQ. Proves our cursor logic - NOT Slack's limits.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const workerSrc = path.join(__dirname, "../src");
function stubModule(request, exports) {
  const resolved = require.resolve(request, { paths: [workerSrc] });
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// ── Queue and database fakes ──
let jobs, failOnQueue;
stubModule("bullmq", {
  Queue: class {
    async add(name, data, opts) {
      if (failOnQueue && failOnQueue(data)) throw new Error("simulated Redis failure");
      if (!jobs.has(opts.jobId)) jobs.set(opts.jobId, data);
    }
  },
});
stubModule("ioredis", class {});

let marker, markerWrites, runs;
stubModule(path.join(workerSrc, "prismaClient"), {
  trigger: { update: async ({ data }) => { marker = data.lastPollHash; markerWrites.push(marker); } },
  zapRun: {
    create: async ({ data }) => {
      if (runs.some((r) => r.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error("dup"), { code: "P2002" });
      const r = { id: `run_${runs.length + 1}`, ...data };
      runs.push(r);
      return r;
    },
    findUnique: async ({ where }) => runs.find((r) => r.idempotencyKey === where.idempotencyKey) || null,
  },
});

// ── Fake Slack channel ──
let channel, historyCalls, failHistory;
const tsCmp = (a, b) => require("../src/pollingCron").compareSlackTs(a, b);
global.fetch = async (url) => {
  const u = new URL(String(url));
  const method = u.pathname.split("/").pop();
  const json = (b) => ({ ok: true, status: 200, json: async () => b });
  if (method === "conversations.history") {
    const p = Object.fromEntries(u.searchParams);
    historyCalls.push(p);
    const failure = failHistory && failHistory(historyCalls.length, p);
    if (failure) return json({ ok: false, error: failure });
    const limit = Number(p.limit || 100);
    const start = Number(p.cursor || 0);
    const matching = channel
      .filter((m) => !p.oldest || tsCmp(m.ts, p.oldest) > 0)
      .sort((a, b) => tsCmp(b.ts, a.ts)); // newest first, like Slack
    const page = matching.slice(start, start + limit);
    const hasMore = start + limit < matching.length;
    return json({ ok: true, messages: page, has_more: hasMore, response_metadata: { next_cursor: hasMore ? String(start + limit) : "" } });
  }
  if (method === "users.info" || method === "conversations.info") return json({ ok: false, error: "not_needed" });
  throw new Error(`Unexpected fetch ${u}`);
};

const { pollSlackTrigger, compareSlackTs } = require("../src/pollingCron");
const { MAX_PAGES, PAGE_LIMIT } = require("../src/integrations/slack/channelHistory");

const ts = (i) => `${1700000000 + i}.000100`;
const msg = (i, extra = {}) => ({ type: "message", text: `m${i}`, user: "U1", ts: ts(i), ...extra });
const trigger = () => ({ id: "t1", zapId: "z1", connection: { accessToken: "xoxb-fake" }, lastPollHash: marker, config: { provider: "slack", channel: "C1" } });
const runTexts = () => runs.map((r) => r.triggerPayload.message.text);

beforeEach(() => {
  jobs = new Map();
  failOnQueue = null;
  marker = null;
  markerWrites = [];
  runs = [];
  channel = [];
  historyCalls = [];
  failHistory = null;
});

test("more than 10 new messages between polls: every one gets a run, oldest first", async () => {
  channel = [msg(0)];
  marker = ts(0);
  for (let i = 1; i <= 25; i++) channel.push(msg(i));

  await pollSlackTrigger(trigger());

  assert.equal(runs.length, 25);
  assert.deepEqual(runTexts(), Array.from({ length: 25 }, (_, i) => `m${i + 1}`));
  assert.equal(jobs.size, 25);
  assert.equal(marker, ts(25));
  assert.equal(historyCalls[0].oldest, ts(0), "asks Slack only for messages after the checkpoint");
});

test("multiple pages: follows next_cursor until Slack has no more", async () => {
  marker = ts(0);
  for (let i = 1; i <= 450; i++) channel.push(msg(i));

  await pollSlackTrigger(trigger());

  assert.equal(historyCalls.length, 3, "450 messages = 3 pages of 200");
  assert.deepEqual(historyCalls.map((c) => c.cursor), [undefined, "200", "400"]);
  assert.ok(historyCalls.every((c) => c.oldest === ts(0) && c.limit === String(PAGE_LIMIT)));
  assert.equal(runs.length, 450);
  assert.equal(runs[0].triggerPayload.message.text, "m1");
  assert.equal(runs.at(-1).triggerPayload.message.text, "m450");
  assert.equal(marker, ts(450));
});

test("first check on a channel with messages: baseline at the newest, no runs for history", async () => {
  for (let i = 1; i <= 15; i++) channel.push(msg(i));
  await pollSlackTrigger(trigger());
  assert.equal(marker, ts(15));
  assert.equal(runs.length, 0);

  channel.push(msg(16));
  await pollSlackTrigger(trigger());
  assert.deepEqual(runTexts(), ["m16"]);
});

test("empty channel: baseline is still set, so the first message ever posted is not lost", async () => {
  await pollSlackTrigger(trigger());
  assert.ok(marker, "a baseline was saved even though the channel is empty");
  assert.equal(runs.length, 0);

  const now = Date.now();
  channel.push({ type: "message", text: "first!", user: "U1", ts: `${Math.floor(now / 1000)}.000001` });
  await pollSlackTrigger(trigger());
  assert.deepEqual(runTexts(), ["first!"]);
});

test("channel with only join notices: baseline after them; the first real message runs", async () => {
  channel = [msg(1, { subtype: "channel_join" }), msg(2, { subtype: "channel_join" })];
  await pollSlackTrigger(trigger());
  assert.equal(marker, ts(2));

  channel.push(msg(3));
  await pollSlackTrigger(trigger());
  assert.deepEqual(runTexts(), ["m3"]);
});

test("no new messages: nothing runs and the checkpoint is not rewritten", async () => {
  channel = [msg(1)];
  marker = ts(1);
  await pollSlackTrigger(trigger());
  assert.equal(runs.length, 0);
  assert.deepEqual(markerWrites, []);
});

test("filtering is unchanged: only plain messages run; the checkpoint skips past the rest", async () => {
  marker = ts(0);
  channel = [
    msg(1),
    msg(2, { subtype: "bot_message" }),
    msg(3, { subtype: "channel_join" }),
    msg(4),
    msg(5, { subtype: "message_changed" }),
    { type: "not_a_message", ts: ts(6) },
  ];
  await pollSlackTrigger(trigger());
  assert.deepEqual(runTexts(), ["m1", "m4"]);
  assert.equal(marker, ts(6), "trailing non-triggering messages aren't fetched again");

  await pollSlackTrigger(trigger());
  assert.equal(runs.length, 2);
});

test("duplicates: overlapping pages and a message at the checkpoint never produce extra runs", async () => {
  marker = ts(5);
  const realFetch = global.fetch;
  // Slack (or a proxy) misbehaves: returns the checkpoint message and the same message twice.
  global.fetch = async (url) => {
    if (!String(url).includes("conversations.history")) return realFetch(url);
    return { ok: true, status: 200, json: async () => ({ ok: true, messages: [msg(7), msg(6), msg(6), msg(5), msg(4)], has_more: false }) };
  };
  try {
    await pollSlackTrigger(trigger());
  } finally {
    global.fetch = realFetch;
  }
  assert.deepEqual(runTexts(), ["m6", "m7"]);
  assert.equal(jobs.size, 2);
});

test("duplicates: a crash after saving runs but before moving the checkpoint re-polls without duplicate runs", async () => {
  marker = ts(0);
  channel = [msg(1), msg(2), msg(3)];
  await pollSlackTrigger(trigger());
  assert.equal(runs.length, 3);

  marker = ts(0); // checkpoint write "lost"
  await pollSlackTrigger(trigger());
  assert.equal(runs.length, 3, "same messages, no new runs");
  assert.equal(jobs.size, 3, "and no new jobs");
  assert.equal(marker, ts(3));
});

test("Slack failure on a later page (rate limit): nothing runs, checkpoint unchanged; next poll catches up", async () => {
  marker = ts(0);
  for (let i = 1; i <= 450; i++) channel.push(msg(i));
  failHistory = (call) => (call === 2 ? "ratelimited" : null);

  await pollSlackTrigger(trigger());
  assert.equal(runs.length, 0);
  assert.equal(marker, ts(0));

  failHistory = null;
  await pollSlackTrigger(trigger());
  assert.equal(runs.length, 450);
  assert.equal(marker, ts(450));
});

test("queue failure mid-batch: checkpoint stays on the last queued message; next poll queues the rest once", async () => {
  marker = ts(0);
  for (let i = 1; i <= 5; i++) channel.push(msg(i));
  failOnQueue = (data) => data.zapRunId === "run_3";

  await assert.rejects(pollSlackTrigger(trigger()), /simulated Redis failure/);
  assert.equal(marker, ts(2), "never past a message whose run isn't queued");
  assert.equal(jobs.size, 2);

  failOnQueue = null; // Redis back
  await pollSlackTrigger(trigger());
  assert.equal(runs.length, 5, "run 3 was saved once and is reused, not duplicated");
  assert.equal(jobs.size, 5);
  assert.ok(jobs.has("zap-run-run_3"));
  assert.equal(marker, ts(5));
});

test("backlog longer than the page cap: nothing is processed or skipped, the checkpoint stays", async () => {
  marker = ts(0);
  const total = MAX_PAGES * PAGE_LIMIT + 1;
  for (let i = 1; i <= total; i++) channel.push(msg(i));

  await pollSlackTrigger(trigger());
  assert.equal(historyCalls.length, MAX_PAGES);
  assert.equal(runs.length, 0);
  assert.equal(marker, ts(0));
});

test("compareSlackTs orders ts strings exactly (no float rounding)", () => {
  assert.equal(compareSlackTs("1700000000.000010", "1700000000.000009"), 1);
  assert.equal(compareSlackTs("1700000000.9", "1700000001.000000"), -1);
  assert.equal(compareSlackTs("1700000000.123456", "1700000000.123456"), 0);
  assert.equal(compareSlackTs("1700000000.1", "1700000000.100000"), 0);
});
