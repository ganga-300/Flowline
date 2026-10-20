// Mocked tests for Slack actions (Send Channel Message, Send Direct Message).
// MOCKED: Slack Web API (global.fetch, response shapes from Slack's docs) and Prisma.
// Proves the calls we make and the errors we report - NOT your workspace's settings.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = require.resolve(path.join(__dirname, "../src/prismaClient"));
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {
  connection: { findUnique: async () => ({ id: "c_sl", provider: "slack:Acme", accessToken: "xoxb-fake" }) },
} };

let calls = [];
let responses = {};
global.fetch = async (url, opts = {}) => {
  const method = String(url).match(/slack\.com\/api\/([a-zA-Z.]+)/)[1];
  calls.push({ method, url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
  const body = (responses[method] || []).shift() ?? { ok: false, error: "unexpected_call" };
  return { ok: true, status: 200, json: async () => body };
};

const sendMessage = require("../src/integrations/slack/sendMessage");
const sendDm = require("../src/integrations/slack/sendDm");
const ctx = { trigger: { issue: { title: "Login broken", html_url: "https://github.com/o/r/issues/7" } }, steps: {} };
const step = (action, config) => ({ id: "s1", connectionId: "c_sl", config: { provider: "slack", action, config } });

beforeEach(() => { calls = []; responses = {}; });

test("send message: posts templated text to the selected channel id", async () => {
  responses["chat.postMessage"] = [{ ok: true, ts: "1.1", channel: "C1" }];
  const out = await sendMessage(step("send_message", { channel: "C1", text: "New: {{trigger.issue.title}} {{trigger.issue.html_url}}" }), ctx);
  assert.deepEqual(calls[0].body, { channel: "C1", text: "New: Login broken https://github.com/o/r/issues/7" });
  assert.deepEqual(out.output, { status: "SENT", messageId: "1.1", channel: "C1" });
});

test("send message: no channel selected is an error (no silent #general)", async () => {
  await assert.rejects(sendMessage(step("send_message", { text: "hi" }), ctx), /channel/i);
  assert.equal(calls.length, 0);
});

test("send message: private channel the app isn't in explains /invite", async () => {
  responses["chat.postMessage"] = [{ ok: false, error: "not_in_channel" }];
  await assert.rejects(sendMessage(step("send_message", { channel: "G1", text: "hi" }), ctx), /\/invite/);
});

test("send DM to a user id: opens the DM then posts into it", async () => {
  responses["conversations.open"] = [{ ok: true, channel: { id: "D1" } }];
  responses["chat.postMessage"] = [{ ok: true, ts: "2.2" }];
  const out = await sendDm(step("send_dm", { userId: "U1", text: "Ping {{trigger.issue.title}}" }), ctx);
  assert.deepEqual(calls.map((c) => c.method), ["conversations.open", "chat.postMessage"]);
  assert.deepEqual(calls[0].body, { users: "U1" });
  assert.deepEqual(calls[1].body, { channel: "D1", text: "Ping Login broken" });
  assert.equal(out.output.channelId, "D1");
});

test("send DM to an email: looks the user up first", async () => {
  responses["users.lookupByEmail"] = [{ ok: true, user: { id: "U9" } }];
  responses["conversations.open"] = [{ ok: true, channel: { id: "D9" } }];
  responses["chat.postMessage"] = [{ ok: true, ts: "3.3" }];
  await sendDm(step("send_dm", { userId: "ana@example.com", text: "hi" }), ctx);
  assert.match(calls[0].url, /users\.lookupByEmail\?email=ana%40example\.com/);
  assert.deepEqual(calls[1].body, { users: "U9" });
});

test("send DM: if the DM can't be opened, fail clearly instead of posting elsewhere", async () => {
  responses["conversations.open"] = [{ ok: false, error: "missing_scope" }];
  await assert.rejects(sendDm(step("send_dm", { userId: "U1", text: "hi" }), ctx), /[Rr]econnect Slack/);
  assert.equal(calls.some((c) => c.method === "chat.postMessage"), false);
});

test("send DM: unknown email gives a readable error", async () => {
  responses["users.lookupByEmail"] = [{ ok: false, error: "users_not_found" }];
  await assert.rejects(sendDm(step("send_dm", { userId: "nobody@example.com", text: "hi" }), ctx), /No Slack user.*nobody@example\.com/);
});
