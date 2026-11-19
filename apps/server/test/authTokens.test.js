// Login tokens vs OAuth `state` values: both are JWTs signed with JWT_SECRET, and each is
// accepted only where it belongs. returnUrl can only point at a path on the frontend.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
const path = require("node:path");
// requireAuth checks the account still exists and the token's version is current.
const accounts = { u1: { tokenVersion: 0 }, u2: { tokenVersion: 3 } };
const prismaPath = require.resolve(path.join(__dirname, "../src/prismaClient.js"));
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { user: { findUnique: async ({ where }) => accounts[where.id] || null } } };
const { signSessionToken, verifySessionToken, signOAuthState, verifyOAuthState, safeReturnUrl } = require("../src/lib/authTokens");
const requireAuth = require("../src/middleware/auth");

async function authStatus(token) {
  let status = 200;
  await requireAuth({ headers: { authorization: `Bearer ${token}` } }, { status(c) { status = c; return this; }, json() { return this; } }, () => {});
  return status;
}

test("a login token is accepted by requireAuth", async () => {
  assert.equal(await authStatus(signSessionToken("u1")), 200);
  assert.equal(verifySessionToken(signSessionToken("u1")).userId, "u1");
});

test("an OAuth state value is NOT a login token (it travels through the provider's URL)", async () => {
  assert.equal(await authStatus(signOAuthState({ userId: "u1", provider: "github", returnUrl: "/x" })), 401);
  // ...including state values issued before `typ` existed.
  assert.equal(await authStatus(jwt.sign({ userId: "u1", provider: "github", returnUrl: "/x" }, "test-secret")), 401);
});

test("login tokens issued before `typ` existed keep working until they expire", async () => {
  assert.equal(await authStatus(jwt.sign({ userId: "u1" }, "test-secret", { expiresIn: "7d" })), 200);
});

test("a state value is accepted only by the callback of the app it was issued for", async () => {
  const state = signOAuthState({ userId: "u1", provider: "slack", returnUrl: "/zaps/new" });
  assert.equal(verifyOAuthState(state, "slack").userId, "u1");
  assert.throws(() => verifyOAuthState(state, "github"));
  assert.throws(() => verifyOAuthState(signSessionToken("u1"), "slack"), "a login token is not a state value");
});

test("returnUrl must be a path on the frontend", async () => {
  for (const ok of ["/connections", "/zaps/new?step=2", "/zaps/abc/edit#x"]) assert.equal(safeReturnUrl(ok), ok);
  for (const bad of ["@evil.com", "//evil.com", "/\\evil.com", "/\t/evil.com", "https://evil.com", "evil.com", "", undefined, ["/x"]]) {
    assert.equal(safeReturnUrl(bad), "/connections", JSON.stringify(bad));
  }
  const state = signOAuthState({ userId: "u1", provider: "gmail", returnUrl: "@evil.com" });
  assert.equal(verifyOAuthState(state, "gmail").returnUrl, "/connections");
});

test("a token stops working when the account's token version moves on (password change, log out everywhere) or the account is gone", async () => {
  assert.equal(await authStatus(signSessionToken("u2", 3)), 200);
  assert.equal(await authStatus(signSessionToken("u2", 2)), 401, "signed before the last password change");
  assert.equal(await authStatus(signSessionToken("u_deleted")), 401, "account deleted");
});
