// Mocked tests for reading Slack channel history (used by the Slack trigger).
// MOCKED: Slack Web API via global.fetch, with response shapes from Slack's docs.
// Proves our join/retry/error handling - NOT what your workspace allows.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

let calls = [];
let responses = {}; // method -> array of bodies returned in order
global.fetch = async (url, opts = {}) => {
  const method = String(url).match(/slack\.com\/api\/([a-z.]+)/)[1];
  calls.push({ method, body: opts.body ? JSON.parse(opts.body) : null, auth: opts.headers?.Authorization });
  const body = (responses[method] || []).shift() ?? { ok: false, error: "unexpected_call" };
  return { ok: true, status: 200, json: async () => body };
};

const { fetchChannelHistory } = require("../src/integrations/slack/channelHistory");
const msgs = [{ type: "message", text: "hi", ts: "1.1" }];

beforeEach(() => { calls = []; responses = {}; });

test("member of the channel: returns messages without joining", async () => {
  responses["conversations.history"] = [{ ok: true, messages: msgs }];
  assert.deepEqual(await fetchChannelHistory("xoxb-fake", "C1"), msgs);
  assert.deepEqual(calls.map((c) => c.method), ["conversations.history"]);
});

test("not_in_channel on a public channel: joins, then retries", async () => {
  responses["conversations.history"] = [{ ok: false, error: "not_in_channel" }, { ok: true, messages: msgs }];
  responses["conversations.join"] = [{ ok: true, channel: { id: "C1" } }];
  assert.deepEqual(await fetchChannelHistory("xoxb-fake", "C1"), msgs);
  assert.deepEqual(calls.map((c) => c.method), ["conversations.history", "conversations.join", "conversations.history"]);
  assert.deepEqual(calls[1].body, { channel: "C1" });
});

test("private channel the app can't join: tells the user to /invite the app", async () => {
  responses["conversations.history"] = [{ ok: false, error: "not_in_channel" }];
  responses["conversations.join"] = [{ ok: false, error: "method_not_supported_for_channel_type" }];
  await assert.rejects(fetchChannelHistory("xoxb-fake", "G1"), /\/invite/);
});

test("old connection without channels:join: tells the user to reconnect Slack", async () => {
  responses["conversations.history"] = [{ ok: false, error: "not_in_channel" }];
  responses["conversations.join"] = [{ ok: false, error: "missing_scope" }];
  await assert.rejects(fetchChannelHistory("xoxb-fake", "C1"), /[Rr]econnect Slack/);
});

test("other Slack errors are reported with their code", async () => {
  responses["conversations.history"] = [{ ok: false, error: "channel_not_found" }];
  await assert.rejects(fetchChannelHistory("xoxb-fake", "C404"), /channel_not_found|not found/);
  responses["conversations.history"] = [{ ok: false, error: "invalid_auth" }];
  await assert.rejects(fetchChannelHistory("xoxb-fake", "C1"), /invalid_auth/);
});
