// Slack user/channel name lookup for the "New Message" trigger.
// MOCKED: Slack users.info / conversations.info via global.fetch (shapes from Slack's docs).
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

let calls = [];
let users = {};
let channels = {};
global.fetch = async (url) => {
  const u = new URL(String(url));
  calls.push(u.pathname);
  const json = (b) => ({ ok: true, status: 200, json: async () => b });
  if (u.pathname === "/api/users.info") {
    const user = users[u.searchParams.get("user")];
    return json(user ? { ok: true, user } : { ok: false, error: "user_not_found" });
  }
  if (u.pathname === "/api/conversations.info") {
    const channel = channels[u.searchParams.get("channel")];
    return json(channel ? { ok: true, channel } : { ok: false, error: "channel_not_found" });
  }
  throw new Error(`Unexpected fetch ${u}`);
};

const { createSlackNameResolver } = require("../src/integrations/slack/names");

beforeEach(() => {
  calls = [];
  users = {
    U1: { id: "U1", name: "ana", real_name: "Ana Lopez", profile: { display_name: "ana.l", real_name: "Ana Lopez" } },
    U2: { id: "U2", name: "bob", real_name: "Bob", profile: { display_name: "", real_name: "Bob Stone" } },
  };
  channels = { C1: { id: "C1", name: "flowline-test" } };
});

test("prefers the Slack display name, then the real name", async () => {
  const names = createSlackNameResolver("xoxb-fake");
  assert.equal(await names.userName("U1"), "ana.l");
  assert.equal(await names.userName("U2"), "Bob Stone");
});

test("channel name comes from conversations.info", async () => {
  const names = createSlackNameResolver("xoxb-fake");
  assert.equal(await names.channelName("C1"), "flowline-test");
});

test("each user is looked up once per resolver (several messages from one person)", async () => {
  const names = createSlackNameResolver("xoxb-fake");
  await names.userName("U1");
  await names.userName("U1");
  assert.equal(calls.filter((p) => p === "/api/users.info").length, 1);
});

test("lookup failures fall back to the id instead of failing the run", async () => {
  const names = createSlackNameResolver("xoxb-fake");
  assert.equal(await names.userName("U404"), "U404");
  assert.equal(await names.channelName("C404"), "C404");
  global.fetch = async () => { throw new Error("network down"); };
  assert.equal(await createSlackNameResolver("x").userName("U1"), "U1");
});
