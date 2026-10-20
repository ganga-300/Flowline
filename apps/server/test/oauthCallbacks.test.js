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
const created = [];
const fakePrisma = {
  connection: {
    create: async ({ data }) => {
      created.push(data);
      return { id: `conn_${created.length}`, ...data };
    },
  },
};
const prismaPath = require.resolve(path.join(__dirname, "../src/prismaClient"));
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };

const jwt = require("jsonwebtoken");

// Fake provider APIs. Responses mimic the documented shapes of each endpoint.
global.fetch = async (url) => {
  const u = String(url);
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  if (u.startsWith("https://github.com/login/oauth/access_token")) return json({ access_token: "gh-fake-token" });
  if (u.startsWith("https://api.github.com/user")) return json({ login: "octo" });
  if (u.startsWith("https://slack.com/api/oauth.v2.access")) return json({ ok: true, access_token: "xoxb-fake", team: { name: "Acme" } });
  if (u.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "ya29-fake", refresh_token: "1//refresh-fake" });
  if (u.startsWith("https://www.googleapis.com/oauth2/v2/userinfo")) return json({ email: "me@example.com" });
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
  return jwt.sign({ userId: "user_1", provider, returnUrl }, process.env.JWT_SECRET);
}

beforeEach(() => { created.length = 0; });

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
