// Mocked tests for the OAuth *start* routes: checks the provider authorize URL we redirect to.
// Proves the parameters we send, NOT how GitHub/Google/Slack render their consent pages.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.JWT_SECRET = "test-jwt-secret";
process.env.GITHUB_CLIENT_ID = "gh-client";
process.env.SLACK_CLIENT_ID = "slack-client";
process.env.GOOGLE_CLIENT_ID = "google-client";
process.env.GOOGLE_CLIENT_SECRET = "google-secret";

const prismaPath = require.resolve(path.join(__dirname, "../src/prismaClient"));
// The session check looks the account up (token version); every test user is at version 0.
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { user: { findUnique: async () => ({ tokenVersion: 0 }) } } };

function startUrl(provider) {
  const router = require(`../src/routes/connections/${provider}`);
  const handler = router.stack.find((l) => l.route?.path === "/start").route.stack.at(-1).handle;
  let location = null;
  handler({ userId: "user_1", query: { returnUrl: "/zaps/new" } }, {
    redirect: (u) => { location = u; },
    status() { return this; },
    json() { return this; },
  });
  return new URL(location);
}

test("github start: always shows GitHub's account picker", () => {
  const url = startUrl("github");
  assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(url.searchParams.get("prompt"), "select_account");
});

test("gmail start: shows Google's account chooser and still asks consent (for a refresh token)", () => {
  const url = startUrl("gmail");
  assert.equal(url.searchParams.get("prompt"), "select_account consent");
  assert.equal(url.searchParams.get("access_type"), "offline");
});

test("slack start: redirects to Slack's v2 authorize page with signed state", () => {
  const url = startUrl("slack");
  assert.equal(url.origin + url.pathname, "https://slack.com/oauth/v2/authorize");
  assert.ok(url.searchParams.get("state"));
});

test("slack start: requests the permissions the trigger and DM action need", () => {
  const scopes = startUrl("slack").searchParams.get("scope").split(",");
  for (const scope of ["channels:history", "channels:join", "chat:write", "im:write", "users:read.email"]) {
    assert.ok(scopes.includes(scope), `missing Slack scope ${scope}`);
  }
});

// --- Problems redirect back to the app with ?error= (never a raw JSON page) ---

process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://frontend.test";

async function startWith(provider, req) {
  const router = require(`../src/routes/connections/${provider}`);
  const stack = router.stack.find((l) => l.route?.path === "/start").route.stack;
  let location = null;
  const res = { redirect: (u) => { location = u; }, status() { return this; }, json() { throw new Error("start routes must not answer with JSON"); } };
  const fullReq = { headers: {}, query: {}, ...req };
  // Run the middleware chain: auth, then the handler.
  let i = 0;
  const next = async () => { const layer = stack[i++]; if (layer) await layer.handle(fullReq, res, next); };
  await next();
  return location && new URL(location);
}

test("start: an expired or missing session goes back to the page with an error", async () => {
  for (const provider of ["github", "gmail", "slack"]) {
    const expired = await startWith(provider, { query: { token: "not-a-jwt", returnUrl: "/zaps/new" } });
    assert.equal(expired.pathname, "/zaps/new");
    assert.match(expired.searchParams.get("error"), /session has expired/);

    const missing = await startWith(provider, { query: { returnUrl: "/connections" } });
    assert.equal(missing.pathname, "/connections");
    assert.match(missing.searchParams.get("error"), /Sign in/);
  }
});

test("start: an unsafe returnUrl falls back to the Apps page", async () => {
  const url = await startWith("github", { query: { token: "bad", returnUrl: "//evil.example" } });
  assert.equal(url.origin, new URL(process.env.FRONTEND_URL.split(",")[0]).origin);
  assert.equal(url.pathname, "/connections");
});

test("start: a server without the provider's client id says so on the page instead of returning JSON", async () => {
  const { signSessionToken } = require("../src/lib/authTokens");
  const token = signSessionToken("user_1");
  const saved = process.env.SLACK_CLIENT_ID;
  delete process.env.SLACK_CLIENT_ID;
  try {
    const url = await startWith("slack", { query: { token, returnUrl: "/zaps/new" } });
    assert.equal(url.pathname, "/zaps/new");
    assert.match(url.searchParams.get("error"), /Connecting Slack isn't set up.*SLACK_CLIENT_ID/);
  } finally {
    process.env.SLACK_CLIENT_ID = saved;
  }
});
