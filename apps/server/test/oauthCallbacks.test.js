// Mocked tests for the OAuth callback handlers.
// These stub the provider token endpoints (global.fetch) and Prisma, so they
// prove the handler logic only - NOT that real GitHub/Slack/Google OAuth works.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.JWT_SECRET = "test-jwt-secret";
process.env.FRONTEND_URL = "http://frontend.test";
process.env.GITHUB_CLIENT_ID = "gh-client";
process.env.GITHUB_CLIENT_SECRET = "gh-secret";
process.env.SLACK_CLIENT_ID = "slack-client";
process.env.SLACK_CLIENT_SECRET = "slack-secret";
process.env.GOOGLE_CLIENT_ID = "google-client";
process.env.GOOGLE_CLIENT_SECRET = "google-secret";

// Replace the real Prisma client with an in-memory fake before routes load it.
// `rows` is the Connection table; `created` records the data passed to create().
const rows = [];
const created = [];
let nextId = 0;
const fakePrisma = {
  connection: {
    findFirst: async ({ where, orderBy }) => {
      const matches = rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
      if (orderBy?.createdAt === "desc") matches.sort((a, b) => b.createdAt - a.createdAt);
      return matches[0] ? { ...matches[0] } : null;
    },
    create: async ({ data }) => {
      created.push(data);
      nextId += 1;
      const row = { id: `conn_${nextId}`, createdAt: new Date(nextId), refreshToken: null, ...data };
      rows.push(row);
      return { ...row };
    },
    update: async ({ where, data }) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error(`No connection ${where.id}`);
      Object.assign(row, data);
      return { ...row };
    },
  },
};

// Seed a pre-existing connection row (not counted in `created`).
function seed(row) {
  nextId += 1;
  const full = { id: `seed_${nextId}`, createdAt: new Date(nextId), refreshToken: null, ...row };
  rows.push(full);
  return full;
}
const prismaPath = require.resolve(path.join(__dirname, "../src/prismaClient"));
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };

const jwt = require("jsonwebtoken");

// Fake provider APIs. Responses mimic the documented shapes of each endpoint.
// `providerResponses` can be tweaked per test (reset in beforeEach).
const defaultProviderResponses = () => ({
  githubLogin: "octo",
  slackTeam: { name: "Acme" },
  gmailEmail: "me@example.com",
  gmailRefreshToken: "1//refresh-fake",
});
let providerResponses = defaultProviderResponses();

global.fetch = async (url) => {
  const u = String(url);
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const p = providerResponses;
  if (u.startsWith("https://github.com/login/oauth/access_token")) return json({ access_token: "gh-fake-token" });
  if (u.startsWith("https://api.github.com/user")) return p.githubLogin ? json({ login: p.githubLogin }) : json({ message: "Bad credentials" }, 401);
  if (u.startsWith("https://slack.com/api/oauth.v2.access")) return json({ ok: true, access_token: "xoxb-fake", team: p.slackTeam });
  if (u.startsWith("https://oauth2.googleapis.com/token")) {
    return json({ access_token: "ya29-fake", ...(p.gmailRefreshToken ? { refresh_token: p.gmailRefreshToken } : {}) });
  }
  if (u.startsWith("https://www.googleapis.com/oauth2/v2/userinfo")) return json({ email: p.gmailEmail });
  throw new Error(`Unexpected fetch in test: ${u}`);
};

function getCallback(provider) {
  const router = require(`../src/routes/connections/${provider}`);
  const layer = router.stack.find((l) => l.route && l.route.path === "/callback");
  return layer.route.stack[0].handle;
}

async function callCallback(provider, query) {
  let redirectedTo = null;
  const res = { redirect: (u) => { redirectedTo = u; } };
  await getCallback(provider)({ query }, res);
  return redirectedTo;
}

function stateFor(provider, returnUrl = "/zaps/new") {
  return jwt.sign({ userId: "user_1", provider, returnUrl, typ: "oauth_state" }, process.env.JWT_SECRET);
}

beforeEach(() => {
  rows.length = 0;
  created.length = 0;
  nextId = 0;
  providerResponses = defaultProviderResponses();
});

const expectedProvider = { github: "github:octo", slack: "slack:Acme", gmail: "gmail:me@example.com" };

for (const provider of ["github", "slack", "gmail"]) {
  test(`${provider}: valid code + state saves connection and redirects back to returnUrl`, async () => {
    const url = await callCallback(provider, { code: "auth-code", state: stateFor(provider) });

    assert.equal(created.length, 1, "exactly one connection saved");
    assert.equal(created[0].userId, "user_1");
    assert.equal(created[0].provider, expectedProvider[provider]);
    assert.equal(url, `http://frontend.test/zaps/new?connected=${provider}&connectionId=conn_1`);
  });

  test(`${provider}: provider error param redirects with error and saves nothing`, async () => {
    const url = await callCallback(provider, { error: "access_denied", state: stateFor(provider) });

    assert.equal(created.length, 0);
    assert.match(url, /^http:\/\/frontend\.test\/zaps\/new\?error=/);
    assert.match(decodeURIComponent(url), /access_denied/);
  });

  test(`${provider}: invalid state redirects with error and saves nothing`, async () => {
    const url = await callCallback(provider, { code: "auth-code", state: "not-a-jwt" });

    assert.equal(created.length, 0);
    assert.match(url, /^http:\/\/frontend\.test\/connections\?error=/);
  });
}

test("gmail: refresh token is stored for later token refresh", async () => {
  await callCallback("gmail", { code: "auth-code", state: stateFor("gmail") });
  assert.equal(created[0].refreshToken, "1//refresh-fake");
});

// --- Reconnect: the Apps page re-runs OAuth for an existing account ---

const expectedToken = { github: "gh-fake-token", slack: "xoxb-fake", gmail: "ya29-fake" };
const otherAccountProvider = { github: "github:someone-else", slack: "slack:Other Co", gmail: "gmail:other@example.com" };

for (const provider of ["github", "slack", "gmail"]) {
  test(`${provider}: reconnecting the same account updates its tokens in place`, async () => {
    const existing = seed({ userId: "user_1", provider: expectedProvider[provider], accessToken: "old-token" });

    const url = await callCallback(provider, { code: "auth-code", state: stateFor(provider) });

    assert.equal(created.length, 0, "no new connection created");
    assert.equal(rows.length, 1, "still exactly one row");
    assert.equal(rows[0].id, existing.id);
    assert.equal(rows[0].accessToken, expectedToken[provider]);
    assert.equal(rows[0].provider, expectedProvider[provider]);
    assert.equal(url, `http://frontend.test/zaps/new?connected=${provider}&connectionId=${existing.id}`);
  });

  test(`${provider}: connecting a different account of the same provider creates a new row`, async () => {
    const other = seed({ userId: "user_1", provider: otherAccountProvider[provider], accessToken: "other-token" });

    const url = await callCallback(provider, { code: "auth-code", state: stateFor(provider) });

    assert.equal(created.length, 1);
    assert.equal(rows.length, 2);
    assert.equal(rows.find((r) => r.id === other.id).accessToken, "other-token", "other account untouched");
    const fresh = rows.find((r) => r.id !== other.id);
    assert.equal(fresh.provider, expectedProvider[provider]);
    assert.equal(url, `http://frontend.test/zaps/new?connected=${provider}&connectionId=${fresh.id}`);
  });

  test(`${provider}: another user's connection to the same account is not touched`, async () => {
    const theirs = seed({ userId: "user_2", provider: expectedProvider[provider], accessToken: "their-token", refreshToken: "their-refresh" });

    const url = await callCallback(provider, { code: "auth-code", state: stateFor(provider) });

    assert.equal(created.length, 1);
    assert.equal(rows.length, 2);
    const stillTheirs = rows.find((r) => r.id === theirs.id);
    assert.equal(stillTheirs.userId, "user_2");
    assert.equal(stillTheirs.accessToken, "their-token");
    assert.equal(stillTheirs.refreshToken, "their-refresh");
    const mine = rows.find((r) => r.id !== theirs.id);
    assert.equal(mine.userId, "user_1");
    assert.equal(url, `http://frontend.test/zaps/new?connected=${provider}&connectionId=${mine.id}`);
  });
}

test("gmail: reconnect stores the new refresh token when Google returns one", async () => {
  seed({ userId: "user_1", provider: "gmail:me@example.com", accessToken: "old", refreshToken: "1//old-refresh" });
  await callCallback("gmail", { code: "auth-code", state: stateFor("gmail") });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].refreshToken, "1//refresh-fake");
});

test("gmail: reconnect keeps the stored refresh token when Google omits it", async () => {
  providerResponses.gmailRefreshToken = null;
  seed({ userId: "user_1", provider: "gmail:me@example.com", accessToken: "old", refreshToken: "1//old-refresh" });
  await callCallback("gmail", { code: "auth-code", state: stateFor("gmail") });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].accessToken, "ya29-fake");
  assert.equal(rows[0].refreshToken, "1//old-refresh");
});

test("github: without a known login a new row is created rather than overwriting a bare one", async () => {
  providerResponses.githubLogin = null;
  seed({ userId: "user_1", provider: "github", accessToken: "old" });
  await callCallback("github", { code: "auth-code", state: stateFor("github") });
  assert.equal(created.length, 1);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].accessToken, "old");
});

test("slack: the placeholder workspace name never merges connections", async () => {
  providerResponses.slackTeam = undefined;
  seed({ userId: "user_1", provider: "slack:Workspace", accessToken: "old" });
  await callCallback("slack", { code: "auth-code", state: stateFor("slack") });
  assert.equal(created.length, 1);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].accessToken, "old");
});
