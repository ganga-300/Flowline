// Each action handler must mark only "certainly not processed" failures as retryable.
// MOCKED: provider APIs (global.fetch) and Prisma.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { isRetryable } = require("../src/recovery");

const prismaPath = require.resolve(path.join(__dirname, "../src/prismaClient"));
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {
  connection: { findUnique: async ({ where }) => ({ id: where.id, provider: "x:me@example.com", accessToken: "t", refreshToken: null }), update: async () => ({}) },
} };

let reply;
global.fetch = async () => ({
  ok: reply.status < 400, status: reply.status,
  headers: { get: (h) => (reply.headers || {})[h.toLowerCase()] ?? null },
  json: async () => reply.body, text: async () => JSON.stringify(reply.body),
});

const handlers = {
  github: () => require("../src/integrations/github/createIssue")({ id: "s", connectionId: "c", config: { config: { repo: "o/r", title: "t" } } }, { trigger: {}, steps: {} }),
  gmail: () => require("../src/integrations/gmail/sendEmail")({ id: "s", connectionId: "c", config: { config: { to: "a@example.com", subject: "s", body: "b" } } }, { trigger: {}, steps: {} }),
  slack: () => require("../src/integrations/slack/sendMessage")({ id: "s", connectionId: "c", config: { config: { channel: "C1", text: "hi" } } }, { trigger: {}, steps: {} }),
};

async function errorFor(provider, r) {
  reply = r;
  try { await handlers[provider](); } catch (err) { return err; }
  throw new Error("expected the handler to fail");
}

test("GitHub: 429/503 and rate-limit 403 are retryable; 500/422/404 are not", async () => {
  assert.equal(isRetryable(await errorFor("github", { status: 429, body: {} })), true);
  assert.equal(isRetryable(await errorFor("github", { status: 503, body: {} })), true);
  assert.equal(isRetryable(await errorFor("github", { status: 403, headers: { "x-ratelimit-remaining": "0" }, body: {} })), true);
  for (const status of [500, 422, 404, 401]) assert.equal(isRetryable(await errorFor("github", { status, body: {} })), false, `GitHub ${status}`);
});

test("Gmail: 429/502 are retryable; 500/400 are not", async () => {
  assert.equal(isRetryable(await errorFor("gmail", { status: 429, body: {} })), true);
  assert.equal(isRetryable(await errorFor("gmail", { status: 502, body: {} })), true);
  for (const status of [500, 400]) assert.equal(isRetryable(await errorFor("gmail", { status, body: {} })), false, `Gmail ${status}`);
});

test("Slack: 'ratelimited' is retryable; other errors are not", async () => {
  assert.equal(isRetryable(await errorFor("slack", { status: 429, body: { ok: false, error: "ratelimited" } })), true);
  assert.equal(isRetryable(await errorFor("slack", { status: 200, body: { ok: false, error: "internal_error" } })), false);
  assert.equal(isRetryable(await errorFor("slack", { status: 200, body: { ok: false, error: "channel_not_found" } })), false);
});
