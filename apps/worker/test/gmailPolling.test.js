// Gmail "New Email" polling with a historyId checkpoint: every new email that matches the
// search gets exactly one run, across pages; the checkpoint moves only after the whole batch
// is queued; an expired history id is caught up by search instead of skipping emails.
// MOCKED: Gmail API (an in-memory mailbox implementing profile, history.list, messages.list
// with after:, messages.get), Google token refresh, Prisma, Redis/BullMQ.
// Proves our checkpoint logic - NOT Gmail's real limits or search semantics.
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

let marker, markerWrites, runs, savedTokens;
stubModule(path.join(workerSrc, "prismaClient"), {
  trigger: { update: async ({ data }) => { marker = data.lastPollHash; markerWrites.push(marker); } },
  connection: { update: async ({ data }) => { savedTokens.push(data.accessToken); } },
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

// ── Fake Gmail mailbox ──
let mailbox, calls, failRequest, tokenExpired;
function resetMailbox() {
  mailbox = { historyId: 1000, history: [], messages: new Map(), expiredBefore: 0, nextId: 1 };
}
/** A new email arrives: one history record, a new history id. */
function receive({ subject, matches = true, ageSec = 0 } = {}) {
  const id = `msg${mailbox.nextId++}`;
  mailbox.historyId += 1;
  mailbox.messages.set(id, { id, subject: subject || id, matches, internalDate: Date.now() - ageSec * 1000 });
  mailbox.history.push({ id: String(mailbox.historyId), messagesAdded: [{ message: { id, threadId: id } }] });
  return id;
}
const inbox = (n, opts) => Array.from({ length: n }, (_, i) => receive({ subject: `email ${i + 1}`, ...opts }));

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
global.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.host === "oauth2.googleapis.com") {
    tokenExpired = false;
    return json(200, { access_token: "fresh-token" });
  }
  const route = u.pathname.replace("/gmail/v1/users/me", "");
  const p = Object.fromEntries(u.searchParams);
  calls.push({ route, ...p });
  const failure = failRequest && failRequest(route, calls.length, p);
  if (failure) return json(failure, { error: { message: "simulated" } });
  if (tokenExpired && init.headers?.Authorization !== "Bearer fresh-token") return json(401, { error: { message: "expired" } });

  const pageSize = Number(p.maxResults || 100);
  const offset = Number(p.pageToken || 0);
  const page = (items) => ({ items: items.slice(offset, offset + pageSize), next: offset + pageSize < items.length ? String(offset + pageSize) : undefined });

  if (route === "/profile") return json(200, { emailAddress: "me@example.com", historyId: String(mailbox.historyId) });
  if (route === "/history") {
    const start = Number(p.startHistoryId);
    if (start < mailbox.expiredBefore) return json(404, { error: { message: "Requested entity was not found." } });
    const { items, next } = page(mailbox.history.filter((h) => Number(h.id) > start));
    return json(200, { history: items, historyId: String(mailbox.historyId), ...(next && { nextPageToken: next }) });
  }
  if (route === "/messages") {
    const after = Number((p.q.match(/after:(-?\d+)/) || [])[1] || 0);
    const matching = [...mailbox.messages.values()]
      .filter((m) => m.matches && m.internalDate / 1000 > after)
      .sort((a, b) => b.internalDate - a.internalDate || b.id.localeCompare(a.id, undefined, { numeric: true }))
      .map((m) => ({ id: m.id, threadId: m.id }));
    const { items, next } = page(matching);
    return json(200, { messages: items, resultSizeEstimate: matching.length, ...(next && { nextPageToken: next }) });
  }
  const one = route.match(/^\/messages\/(.+)$/);
  if (one) {
    const m = mailbox.messages.get(decodeURIComponent(one[1]));
    if (!m) return json(404, { error: { message: "Requested entity was not found." } });
    return json(200, {
      id: m.id, threadId: m.id, internalDate: String(m.internalDate), snippet: m.subject,
      payload: { headers: [{ name: "Subject", value: m.subject }, { name: "From", value: "Ana <ana@example.com>" }], body: { data: Buffer.from(`body of ${m.subject}`).toString("base64") } },
    });
  }
  throw new Error(`Unexpected fetch ${u}`);
};

const { pollGmailTrigger } = require("../src/pollingCron");
const { MAX_PAGES, PAGE_SIZE } = require("../src/integrations/gmail/mailbox");

const trigger = (query = "is:unread") => ({
  id: "t1", zapId: "z1", lastPollHash: marker,
  connection: { id: "c1", provider: "gmail:me@example.com", accessToken: "old-token", refreshToken: "refresh-1" },
  config: { provider: "gmail", event: "new_email", query },
});
const subjects = () => runs.map((r) => r.triggerPayload.email.subject);
const historyIdOf = (checkpoint) => checkpoint.split(":")[0];
async function baseline() {
  await pollGmailTrigger(trigger());
  calls = [];
  markerWrites = [];
}

let realWarn, warnings;
beforeEach(() => {
  resetMailbox();
  jobs = new Map();
  failOnQueue = null;
  marker = null;
  markerWrites = [];
  runs = [];
  savedTokens = [];
  calls = [];
  failRequest = null;
  tokenExpired = false;
  warnings = [];
  realWarn ??= console.warn;
  console.warn = (msg) => warnings.push(String(msg));
});
process.on("exit", () => { if (realWarn) console.warn = realWarn; });

test("first check on an empty inbox sets a checkpoint; the first email ever received runs", async () => {
  await pollGmailTrigger(trigger());
  assert.match(marker, /^1000:\d+$/);
  assert.equal(runs.length, 0);

  receive({ subject: "hello" });
  await pollGmailTrigger(trigger());
  assert.deepEqual(subjects(), ["hello"]);
});

test("first check on a full inbox: old emails don't run", async () => {
  inbox(30);
  await pollGmailTrigger(trigger());
  assert.equal(runs.length, 0);
  assert.equal(historyIdOf(marker), "1030");
});

test("more than 10 new emails between polls: every one gets a run, oldest first", async () => {
  await baseline();
  inbox(25);
  await pollGmailTrigger(trigger());

  assert.equal(runs.length, 25);
  assert.deepEqual(subjects(), Array.from({ length: 25 }, (_, i) => `email ${i + 1}`));
  assert.equal(jobs.size, 25);
  assert.equal(historyIdOf(marker), "1025");
  assert.equal(calls.find((c) => c.route === "/history").startHistoryId, "1000");
  assert.ok(calls.some((c) => c.route === "/messages" && c.q.startsWith("(is:unread) after:")), "user's search is still applied");
});

test("multiple pages of history and search results are all processed", async () => {
  await baseline();
  inbox(1100);
  await pollGmailTrigger(trigger());

  const historyCalls = calls.filter((c) => c.route === "/history");
  assert.equal(historyCalls.length, 3, "1,100 emails = 3 pages of 500");
  assert.deepEqual(historyCalls.map((c) => c.pageToken), [undefined, "500", "1000"]);
  assert.equal(calls.filter((c) => c.route === "/messages").length, 3);
  assert.equal(runs.length, 1100);
  assert.equal(subjects()[0], "email 1");
  assert.equal(subjects().at(-1), "email 1100");
  assert.equal(historyIdOf(marker), "2100");
});

test("search filter is preserved: emails the query doesn't match don't run, but the checkpoint moves", async () => {
  await baseline();
  receive({ subject: "match 1" });
  receive({ subject: "sent by me", matches: false });
  receive({ subject: "match 2" });
  await pollGmailTrigger(trigger("subject:match"));
  assert.deepEqual(subjects(), ["match 1", "match 2"]);
  assert.equal(historyIdOf(marker), "1003");
  assert.ok(calls.some((c) => c.q?.startsWith("(subject:match) after:")));
});

test("no new email: nothing runs, no search, checkpoint not rewritten", async () => {
  await baseline();
  await pollGmailTrigger(trigger());
  assert.equal(runs.length, 0);
  assert.deepEqual(markerWrites, []);
  assert.ok(!calls.some((c) => c.route === "/messages"));
});

test("duplicates: an email listed twice in history gets one run", async () => {
  await baseline();
  const id = receive({ subject: "twice" });
  mailbox.historyId += 1;
  mailbox.history.push({ id: String(mailbox.historyId), messagesAdded: [{ message: { id } }] });
  await pollGmailTrigger(trigger());
  assert.deepEqual(subjects(), ["twice"]);
  assert.equal(jobs.size, 1);
});

test("duplicates: a lost checkpoint write re-polls the same emails without duplicate runs or jobs", async () => {
  await baseline();
  const before = marker;
  inbox(5);
  await pollGmailTrigger(trigger());
  assert.equal(runs.length, 5);

  marker = before; // the checkpoint write was "lost"
  await pollGmailTrigger(trigger());
  assert.equal(runs.length, 5);
  assert.equal(jobs.size, 5);
  assert.equal(historyIdOf(marker), "1005");
});

test("queue failure mid-batch: checkpoint unchanged; next poll queues the rest, each exactly once", async () => {
  await baseline();
  const before = marker;
  inbox(5);
  failOnQueue = (data) => data.zapRunId === "run_3";

  await pollGmailTrigger(trigger()); // logs and returns, like the previous poller
  assert.equal(marker, before, "checkpoint not moved while a run isn't queued");
  assert.equal(jobs.size, 2);
  assert.ok(warnings.some((w) => w.includes("simulated Redis failure")));

  failOnQueue = null;
  await pollGmailTrigger(trigger());
  assert.equal(runs.length, 5, "the saved-but-unqueued run is reused");
  assert.equal(jobs.size, 5);
  assert.equal(historyIdOf(marker), "1005");
});

test("API failure (history 500, message fetch 503): nothing skipped, checkpoint unchanged; next poll recovers", async () => {
  await baseline();
  const before = marker;
  inbox(4);

  failRequest = (route) => (route === "/history" ? 500 : null);
  await pollGmailTrigger(trigger());
  assert.equal(runs.length, 0);
  assert.equal(marker, before);

  failRequest = (route) => (route === "/messages/msg3" ? 503 : null);
  await pollGmailTrigger(trigger());
  assert.equal(runs.length, 2, "stopped at the email that couldn't be read");
  assert.equal(marker, before);

  failRequest = null;
  await pollGmailTrigger(trigger());
  assert.deepEqual(subjects(), ["email 1", "email 2", "email 3", "email 4"]);
  assert.equal(historyIdOf(marker), "1004");
});

test("expired access token: refreshed once, then polling continues", async () => {
  await baseline();
  inbox(2);
  tokenExpired = true;
  await pollGmailTrigger(trigger());
  assert.equal(runs.length, 2);
  assert.deepEqual(savedTokens, ["fresh-token"]);
});

test("email deleted before it could be read: skipped with a warning, the others run", async () => {
  await baseline();
  inbox(3);
  failRequest = (route) => (route === "/messages/msg2" ? 404 : null); // deleted after the search
  await pollGmailTrigger(trigger());
  assert.deepEqual(subjects(), ["email 1", "email 3"]);
  assert.equal(historyIdOf(marker), "1003");
  assert.ok(warnings.some((w) => w.includes("msg2")));
});

test("expired history id: catches up by search - no email skipped, none duplicated", async () => {
  await baseline();
  inbox(5);
  await pollGmailTrigger(trigger());
  assert.equal(runs.length, 5);

  inbox(30); // emails 1..30 again as subjects, but new messages msg6..msg35
  mailbox.expiredBefore = 999999; // Gmail no longer has history for the checkpoint
  await pollGmailTrigger(trigger());

  assert.equal(runs.length, 35, "all 30 new emails ran; the 5 earlier ones were not duplicated");
  assert.equal(jobs.size, 35);
  assert.ok(warnings.some((w) => w.includes("expired")));
  assert.equal(historyIdOf(marker), "1035", "new checkpoint from the mailbox's current position");

  mailbox.expiredBefore = 0;
  receive({ subject: "after catch-up" });
  await pollGmailTrigger(trigger());
  assert.equal(subjects().at(-1), "after catch-up");
  assert.equal(runs.length, 36);
});

test("expired history id + failure during catch-up: checkpoint unchanged so the catch-up is retried", async () => {
  await baseline();
  const before = marker;
  inbox(3);
  mailbox.expiredBefore = 999999;
  failRequest = (route) => (route === "/messages" ? 500 : null);
  await pollGmailTrigger(trigger());
  assert.equal(runs.length, 0);
  assert.equal(marker, before);

  failRequest = null;
  await pollGmailTrigger(trigger());
  assert.equal(runs.length, 3);
});

test("legacy checkpoint (a message id from the old poller): catches up from that email, then uses history", async () => {
  const old = receive({ subject: "last seen", ageSec: 600 });
  receive({ subject: "missed 1", ageSec: 300 });
  receive({ subject: "missed 2", ageSec: 200 });
  marker = old;
  // The old poller already ran the last-seen email (same idempotency key format).
  runs.push({ id: "run_old", idempotencyKey: `t1-gmail-${old}`, status: "SUCCESS", triggerPayload: { email: { subject: "last seen" } } });

  await pollGmailTrigger(trigger());
  assert.deepEqual(subjects(), ["last seen", "missed 1", "missed 2"], "last seen is not run again");
  assert.equal(jobs.size, 2);
  assert.match(marker, /^1003:\d+$/);
});

test("legacy checkpoint whose email was deleted: restarts from now and warns (can't search from an unknown time)", async () => {
  marker = "deleted-msg";
  await pollGmailTrigger(trigger());
  assert.equal(runs.length, 0);
  assert.match(marker, /^1000:\d+$/);
  assert.ok(warnings.some((w) => w.includes("no longer exists")));
});

test("history backlog longer than the page cap: nothing processed or skipped, checkpoint unchanged", async () => {
  await baseline();
  const before = marker;
  inbox(MAX_PAGES * PAGE_SIZE + 1);
  await pollGmailTrigger(trigger());
  assert.equal(calls.filter((c) => c.route === "/history").length, MAX_PAGES);
  assert.equal(runs.length, 0);
  assert.equal(marker, before);
});
