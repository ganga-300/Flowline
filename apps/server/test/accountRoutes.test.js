// Account routes: forgot/reset password, change password, log out everywhere, delete account,
// email-alert preference. MOCKED: Prisma (in-memory) and the email sender; bcrypt is real.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const bcrypt = require("bcrypt");

process.env.JWT_SECRET = "test-secret";
process.env.FRONTEND_URL = "http://app.test";

let users, resets, sent;
const byId = (id) => users.find((u) => u.id === id) || null;
const applyData = (row, data) => {
  for (const [k, v] of Object.entries(data)) row[k] = v && typeof v === "object" && "increment" in v ? row[k] + v.increment : v;
  return row;
};
const prisma = {
  user: {
    findUnique: async ({ where }) => (where.id ? byId(where.id) : users.find((u) => u.email === where.email) || null),
    findFirst: async ({ where }) => users.find((u) => u.email.toLowerCase() === where.email.equals.toLowerCase()) || null,
    update: async ({ where, data }) => applyData(byId(where.id), data),
    delete: async ({ where }) => { users = users.filter((u) => u.id !== where.id); },
  },
  passwordResetToken: {
    create: async ({ data }) => { resets.push({ id: `r${resets.length}`, usedAt: null, ...data }); },
    findUnique: async ({ where }) => resets.find((r) => r.tokenHash === where.tokenHash) || null,
    updateMany: async ({ where, data }) => { for (const r of resets) if (r.userId === where.userId && r.usedAt === null) Object.assign(r, data); },
  },
  $transaction: async (ops) => Promise.all(ops),
};
const stub = (file, exports) => {
  const resolved = require.resolve(file);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};
stub(path.join(__dirname, "../src/prismaClient.js"), prisma);
const realEmail = require("../../worker/src/email");
stub(path.join(__dirname, "../../worker/src/email.js"), { ...realEmail, sendEmail: async (email) => { sent.push(email); return { sent: true }; } });

const router = require("../src/routes/auth");
const { signSessionToken } = require("../src/lib/authTokens");
const requireAuth = require("../src/middleware/auth");

const route = (method, p) => router.stack.find((l) => l.route?.path === p && l.route.methods[method]).route.stack.at(-1).handle;
async function call(method, p, { body, userId } = {}) {
  const out = { status: 200 };
  await route(method, p)({ body, userId }, { status(c) { out.status = c; return this; }, set() { return this; }, json(b) { out.body = b; return this; } });
  return out;
}
async function authStatus(token) {
  let status = 200;
  await requireAuth({ headers: { authorization: `Bearer ${token}` } }, { status(c) { status = c; return this; }, json() { return this; } }, () => {});
  return status;
}

let hash;
beforeEach(async () => {
  hash = hash || (await bcrypt.hash("old-password", 4));
  users = [{ id: "u1", email: "ana@example.test", password: hash, tokenVersion: 0, emailAlerts: true, createdAt: new Date(0) }];
  resets = [];
  sent = [];
});

test("forgot password: the same answer for any email, and only a real account gets a link", async () => {
  const unknown = await call("post", "/forgot-password", { body: { email: "nobody@example.test" } });
  const known = await call("post", "/forgot-password", { body: { email: "ANA@example.test" } });
  assert.deepEqual(unknown.body, known.body, "can't be used to find out which emails have accounts");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "ana@example.test");
  assert.match(sent[0].text, /http:\/\/app\.test\/reset-password\?token=/);
  assert.notEqual(resets[0].tokenHash, new URL(sent[0].text.match(/http\S+/)[0]).searchParams.get("token"), "only a hash is stored");
});

test("reset link: sets the new password, signs in, ends old sessions, and works only once", async () => {
  const oldToken = signSessionToken("u1", 0);
  await call("post", "/forgot-password", { body: { email: "ana@example.test" } });
  const token = new URL(sent[0].text.match(/http\S+/)[0]).searchParams.get("token");

  assert.equal((await call("post", "/reset-password", { body: { token, password: "short" } })).status, 400);
  const ok = await call("post", "/reset-password", { body: { token, password: "brand-new-password" } });
  assert.equal(ok.status, 200);
  assert.ok(await bcrypt.compare("brand-new-password", users[0].password));
  assert.equal(await authStatus(ok.body.token), 200, "the new token works");
  assert.equal(await authStatus(oldToken), 401, "sessions from before the reset are ended");

  const again = await call("post", "/reset-password", { body: { token, password: "another-password" } });
  assert.equal(again.status, 400);
  assert.match(again.body.error, /expired or was already used/);
});

test("an expired reset link is refused", async () => {
  await call("post", "/forgot-password", { body: { email: "ana@example.test" } });
  resets[0].expiresAt = new Date(Date.now() - 1000);
  const token = new URL(sent[0].text.match(/http\S+/)[0]).searchParams.get("token");
  assert.equal((await call("post", "/reset-password", { body: { token, password: "brand-new-password" } })).status, 400);
});

test("change password needs the current one, and ends other sessions", async () => {
  const before = signSessionToken("u1", 0);
  assert.equal((await call("post", "/change-password", { userId: "u1", body: { currentPassword: "wrong", newPassword: "new-password-1" } })).status, 400);
  const ok = await call("post", "/change-password", { userId: "u1", body: { currentPassword: "old-password", newPassword: "new-password-1" } });
  assert.equal(ok.status, 200);
  assert.equal(await authStatus(before), 401);
  assert.equal(await authStatus(ok.body.token), 200);
});

test("log out everywhere ends every session", async () => {
  const token = signSessionToken("u1", 0);
  await call("post", "/logout-all", { userId: "u1" });
  assert.equal(await authStatus(token), 401);
});

test("email alerts can be turned off and on; the account endpoint shows the setting", async () => {
  assert.equal((await call("patch", "/me", { userId: "u1", body: { emailAlerts: "no" } })).status, 400);
  assert.equal((await call("patch", "/me", { userId: "u1", body: { emailAlerts: false } })).body.user.emailAlerts, false);
  const me = await call("get", "/me", { userId: "u1" });
  assert.deepEqual(me.body.user, { id: "u1", email: "ana@example.test", createdAt: new Date(0), emailAlerts: false });
});

test("deleting the account needs the password", async () => {
  assert.equal((await call("delete", "/account", { userId: "u1", body: { password: "nope" } })).status, 400);
  assert.equal(users.length, 1);
  assert.equal((await call("delete", "/account", { userId: "u1", body: { password: "old-password" } })).status, 200);
  assert.equal(users.length, 0);
  assert.equal(await authStatus(signSessionToken("u1", 0)), 401, "a deleted account's token stops working");
});
