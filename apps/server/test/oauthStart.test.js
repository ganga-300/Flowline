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
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {} };

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
