// Contract test: the builder's sample (/zaps/test-step/fetch-sample) and the real
// poller (pollingCron.js) must produce IDENTICAL trigger payloads for the same
// provider data. Otherwise variables picked while testing are blank in real runs.
//
// MOCKED: provider APIs (global.fetch), Prisma, Redis and BullMQ are all fakes.
// This proves both code paths shape data the same way - NOT that GitHub, Gmail
// or Slack return this data for your real accounts.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const workerSrc = path.join(__dirname, "../src");
const serverSrc = path.join(__dirname, "../../server/src");

function stubModule(request, fromDir, exports) {
  const resolved = require.resolve(request, { paths: [fromDir] });
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// ── Fakes ──
const queued = [];
class FakeQueue { async add(name, data) { queued.push({ name, data }); } }
class FakeRedis {}
stubModule("bullmq", workerSrc, { Queue: FakeQueue });
stubModule("ioredis", workerSrc, FakeRedis);

const createdRuns = [];
const workerPrisma = {
  trigger: { update: async () => ({}) },
  zapRun: {
    create: async ({ data }) => { createdRuns.push(data); return { id: `run_${createdRuns.length}`, status: "QUEUED", ...data }; },
    findUnique: async () => null,
  },
  connection: { update: async () => ({}) },
};
stubModule(path.join(workerSrc, "prismaClient"), workerSrc, workerPrisma);

const connection = { id: "conn_1", userId: "user_1", provider: "x", accessToken: "fake-token", refreshToken: null };
stubModule(path.join(serverSrc, "prismaClient"), serverSrc, {
  connection: { findFirst: async () => connection },
});
process.env.JWT_SECRET = "test-secret";

// ── Fake provider data (shapes follow the GitHub, Gmail and Slack API docs) ──
const b64url = (s) => Buffer.from(s, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fixtures = {
  issues: [
    { id: 202, number: 7, title: "Login button broken", body: "Steps to reproduce...", html_url: "https://github.com/octo/demo/issues/7",
      state: "open", user: { login: "alice", avatar_url: "https://a/img", html_url: "https://github.com/alice" }, created_at: "2026-10-20T10:00:00Z" },
    { id: 101, number: 6, title: "Older issue", body: "", html_url: "https://github.com/octo/demo/issues/6", state: "open", user: { login: "bob" } },
  ],
  commits: [
    { sha: "bbb222", html_url: "https://github.com/octo/demo/commit/bbb222",
      commit: { message: "Fix login", author: { name: "Alice", email: "alice@example.com", date: "2026-10-20T10:00:00Z" } } },
    { sha: "aaa111", html_url: "https://github.com/octo/demo/commit/aaa111", commit: { message: "Init", author: { name: "Bob" } } },
  ],
  gmailList: { messages: [{ id: "m2", threadId: "t2" }, { id: "m1", threadId: "t1" }] },
  gmailMessage: {
    id: "m2", threadId: "t2", snippet: "Hi team, the invoice...",
    payload: {
      headers: [
        { name: "From", value: "Ana <ana@example.com>" }, { name: "To", value: "me@example.com" },
        { name: "Subject", value: "Invoice #42" }, { name: "Date", value: "Tue, 20 Oct 2026 10:00:00 +0530" },
      ],
      parts: [
        { mimeType: "text/html", body: { data: b64url("<p>Hi team, the invoice is attached.</p>") } },
        { mimeType: "text/plain", body: { data: b64url("Hi team, the invoice is attached.") } },
      ],
    },
  },
  slackHistory: { ok: true, messages: [
    { type: "message", text: "Deploy finished", user: "U111", ts: "1729400000.000200" },
    { type: "message", subtype: "channel_join", text: "joined", user: "U222", ts: "1729400000.000150" },
    { type: "message", text: "older", user: "U333", ts: "1729400000.000100" },
  ] },
};

global.fetch = async (url) => {
  const u = String(url);
  const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.includes("api.github.com/repos/octo/demo/issues")) return json(fixtures.issues);
  if (u.includes("api.github.com/repos/octo/demo/commits")) return json(fixtures.commits);
  if (u.includes("gmail.googleapis.com/gmail/v1/users/me/messages/m2")) return json(fixtures.gmailMessage);
  if (u.includes("gmail.googleapis.com/gmail/v1/users/me/messages")) return json(fixtures.gmailList);
  if (u.includes("slack.com/api/conversations.history")) return json(fixtures.slackHistory);
  if (u.includes("slack.com/api/users.info")) return json({ ok: true, user: { id: "U111", name: "ana", profile: { display_name: "ana.l", real_name: "Ana Lopez" } } });
  if (u.includes("slack.com/api/conversations.info")) return json({ ok: true, channel: { id: "C123", name: "flowline-test" } });
  throw new Error(`Unexpected fetch in test: ${u}`);
};

const poller = require("../src/pollingCron");
const fetchSampleHandler = require("../../server/src/routes/testStep")
  .stack.find((l) => l.route?.path === "/fetch-sample").route.stack.at(-1).handle;

async function fetchSample(body) {
  const out = {};
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  await fetchSampleHandler({ body, userId: "user_1" }, res);
  assert.equal(out.status, undefined, `fetch-sample failed: ${JSON.stringify(out.body)}`);
  return out.body.sample;
}

async function pollOnce(pollFn, trigger) {
  createdRuns.length = 0;
  await pollFn({ id: "trig_1", zapId: "zap_1", connection, ...trigger });
  assert.equal(createdRuns.length, 1, "poller should create exactly one run for the one new item");
  return createdRuns[0].triggerPayload;
}

const cases = [
  {
    name: "GitHub new_issue",
    poll: () => pollOnce(poller.pollGitHubTrigger, { lastPollHash: "101", config: { provider: "github", event: "new_issue", repo: "octo/demo" } }),
    sample: () => fetchSample({ provider: "github", event: "new_issue", config: { repo: "octo/demo" }, connectionId: "conn_1" }),
    spot: (p) => { assert.equal(p.issue.title, "Login button broken"); assert.equal(p.issue.user.login, "alice"); assert.equal(p.repository.full_name, "octo/demo"); },
  },
  {
    name: "GitHub new_push",
    poll: () => pollOnce(poller.pollGitHubTrigger, { lastPollHash: "aaa111", config: { provider: "github", event: "new_push", repo: "octo/demo" } }),
    sample: () => fetchSample({ provider: "github", event: "new_push", config: { repo: "octo/demo" }, connectionId: "conn_1" }),
    spot: (p) => { assert.equal(p.commit.message, "Fix login"); assert.equal(p.commit.author.name, "Alice"); },
  },
  {
    name: "Gmail new_email",
    poll: () => pollOnce(poller.pollGmailTrigger, { lastPollHash: "m1", config: { provider: "gmail", query: "is:unread" } }),
    sample: () => fetchSample({ provider: "gmail", event: "new_email", config: { query: "is:unread" }, connectionId: "conn_1" }),
    spot: (p) => { assert.equal(p.email.subject, "Invoice #42"); assert.equal(p.email.from, "Ana <ana@example.com>"); assert.equal(p.email.body, "Hi team, the invoice is attached."); },
  },
  {
    name: "Slack new_message",
    poll: () => pollOnce(poller.pollSlackTrigger, { lastPollHash: "1729400000.000100", config: { provider: "slack", channel: "C123" } }),
    sample: () => fetchSample({ provider: "slack", event: "new_message", config: { channel: "C123" }, connectionId: "conn_1" }),
    spot: (p) => { assert.equal(p.message.text, "Deploy finished"); assert.equal(p.message.user, "U111"); assert.equal(p.message.channel, "C123");
      assert.equal(p.message.user_name, "ana.l"); assert.equal(p.message.channel_name, "flowline-test"); },
  },
];

for (const c of cases) {
  test(`${c.name}: builder sample === real run payload`, async () => {
    const runtime = await c.poll();
    const sample = await c.sample();
    c.spot(runtime);
    assert.deepEqual(sample, runtime);
  });
}
