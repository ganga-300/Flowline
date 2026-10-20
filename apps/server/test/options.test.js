// Mocked tests for GET /connections/:id/options (dynamic dropdown choices).
// Provider APIs (global.fetch) and Prisma are faked - this proves the route's
// mapping and error handling only, NOT that real Slack/GitHub/Gmail calls succeed.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const connections = {
  conn_slack: { id: "conn_slack", userId: "user_1", provider: "slack:Acme", accessToken: "xoxb-fake" },
  conn_gh: { id: "conn_gh", userId: "user_1", provider: "github:octo", accessToken: "gh-fake" },
  conn_gmail: { id: "conn_gmail", userId: "user_1", provider: "gmail:me@example.com", accessToken: "ya29-fake" },
};
const fakePrisma = {
  connection: {
    findFirst: async ({ where }) => {
      const c = connections[where.id];
      return c && c.userId === where.userId ? c : null;
    },
  },
};
const prismaPath = require.resolve(path.join(__dirname, "../src/prismaClient"));
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };

let providerResponse; // set per test: { status, body }
let fetchedUrls = [];
global.fetch = async (url) => {
  fetchedUrls.push(String(url));
  const { status = 200, body } = providerResponse;
  return { ok: status < 400, status, json: async () => body };
};

const router = require("../src/routes/options");
const handler = router.stack.find((l) => l.route?.path === "/:id/options").route.stack.at(-1).handle;

async function getOptions(id, type, userId = "user_1") {
  const out = { status: 200, body: null };
  const res = {
    status(code) { out.status = code; return this; },
    json(body) { out.body = body; return this; },
  };
  await handler({ params: { id }, query: { type }, userId }, res);
  return out;
}

beforeEach(() => { fetchedUrls = []; });

test("slack_channels: maps real channels to {label, value: channel ID}", async () => {
  providerResponse = { body: { ok: true, channels: [{ id: "C123", name: "flowline-test" }] } };
  const out = await getOptions("conn_slack", "slack_channels");
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.options, [{ label: "#flowline-test", value: "C123" }]);
  assert.match(fetchedUrls[0], /exclude_archived=true/);
});

test("slack_channels: Slack error returns 502 with the reason and no fake channels", async () => {
  providerResponse = { body: { ok: false, error: "invalid_auth" } };
  const out = await getOptions("conn_slack", "slack_channels");
  assert.equal(out.status, 502);
  assert.deepEqual(out.body.options, []);
  assert.match(out.body.error, /invalid_auth/);
});

test("slack_users: skips bots/deleted users; error case returns 502", async () => {
  providerResponse = { body: { ok: true, members: [
    { id: "U1", name: "ana", real_name: "Ana" },
    { id: "B1", name: "bot", is_bot: true },
    { id: "U2", name: "old", deleted: true },
  ] } };
  let out = await getOptions("conn_slack", "slack_users");
  assert.deepEqual(out.body.options, [{ label: "Ana (@ana)", value: "U1" }]);

  providerResponse = { body: { ok: false, error: "missing_scope" } };
  out = await getOptions("conn_slack", "slack_users");
  assert.equal(out.status, 502);
  assert.match(out.body.error, /missing_scope/);
});

test("github_repos: maps repos; 401 returns 502 instead of fake repos", async () => {
  providerResponse = { body: [{ full_name: "octo/demo" }] };
  let out = await getOptions("conn_gh", "github_repos");
  assert.deepEqual(out.body.options, [{ label: "octo/demo", value: "octo/demo" }]);

  providerResponse = { status: 401, body: { message: "Bad credentials" } };
  out = await getOptions("conn_gh", "github_repos");
  assert.equal(out.status, 502);
  assert.deepEqual(out.body.options, []);
});

test("gmail_labels: expired token returns 502 instead of fake labels", async () => {
  providerResponse = { status: 401, body: { error: { code: 401 } } };
  const out = await getOptions("conn_gmail", "gmail_labels");
  assert.equal(out.status, 502);
  assert.deepEqual(out.body.options, []);
});

test("another user's connection is not usable (404, no provider call)", async () => {
  const out = await getOptions("conn_slack", "slack_channels", "user_2");
  assert.equal(out.status, 404);
  assert.equal(fetchedUrls.length, 0);
});

test("unknown type returns 400", async () => {
  const out = await getOptions("conn_slack", "nope");
  assert.equal(out.status, 400);
});
