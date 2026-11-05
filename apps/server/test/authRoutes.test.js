// POST /auth/signup and /auth/login: input checks, email normalization, failed-login limit.
// MOCKED: Prisma (in-memory users); bcrypt is real.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const bcrypt = require("bcrypt");

process.env.JWT_SECRET = "test-secret";
let users;
const prisma = {
  user: {
    findUnique: async ({ where }) => users.find((u) => u.email === where.email) || null,
    findFirst: async ({ where }) => users.find((u) => u.email.toLowerCase() === where.email.equals.toLowerCase()) || null,
    create: async ({ data }) => { const u = { id: `u${users.length + 1}`, ...data }; users.push(u); return u; },
  },
};
const prismaPath = require.resolve(path.join(__dirname, "../src/prismaClient.js"));
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };

const router = require("../src/routes/auth");
const { MAX_FAILURES, clearFailures } = require("../src/lib/loginThrottle");
const handler = (p) => router.stack.find((l) => l.route?.path === p).route.stack.at(-1).handle;
async function call(p, body) {
  const out = { status: 200, headers: {} };
  await handler(p)({ body }, {
    status(c) { out.status = c; return this; },
    set(k, v) { out.headers[k] = v; return this; },
    json(b) { out.body = b; return this; },
  });
  return out;
}

let hash;
beforeEach(async () => {
  hash = hash || (await bcrypt.hash("correct-horse", 4));
  users = [{ id: "u_old", email: "Legacy@Example.com", password: hash }];
  clearFailures("ana@example.com");
  clearFailures("legacy@example.com");
});

test("signup: missing, non-text or too-short credentials are a 400 (not a 500)", async () => {
  for (const body of [{}, { email: "a@b.co" }, { email: { $ne: 1 }, password: "x".repeat(8) }, { email: "a@b.co", password: 12345678 }, undefined]) {
    assert.equal((await call("/signup", body)).status, 400, JSON.stringify(body));
  }
  assert.match((await call("/signup", { email: "not-an-email", password: "longenough" })).body.error, /valid email/);
  assert.match((await call("/signup", { email: "a@b.co", password: "short" })).body.error, /at least 8/);
  assert.equal(users.length, 1);
});

test("signup stores the email normalized and rejects a different-case duplicate", async () => {
  const out = await call("/signup", { email: "  Ana@Example.COM ", password: "longenough" });
  assert.equal(out.status, 201);
  assert.equal(users[1].email, "ana@example.com");
  assert.equal((await call("/signup", { email: "legacy@example.com", password: "longenough" })).status, 400);
});

test("login: missing password is a 400; email case doesn't matter, including older accounts", async () => {
  assert.equal((await call("/login", { email: "legacy@example.com" })).status, 400);
  assert.equal((await call("/login", { email: "Legacy@Example.com", password: "correct-horse" })).status, 200);
  await call("/signup", { email: "ana@example.com", password: "longenough" });
  assert.equal((await call("/login", { email: "ANA@example.com", password: "longenough" })).status, 200);
});

test(`login: after ${MAX_FAILURES} wrong passwords the email is locked (429), even with the right one`, async () => {
  for (let i = 0; i < MAX_FAILURES; i++) {
    assert.equal((await call("/login", { email: "legacy@example.com", password: "wrong" })).status, 401);
  }
  const locked = await call("/login", { email: "LEGACY@example.com", password: "correct-horse" });
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers["Retry-After"]) > 0);
});

test("login: a success clears earlier failures", async () => {
  for (let i = 0; i < MAX_FAILURES - 1; i++) await call("/login", { email: "legacy@example.com", password: "wrong" });
  assert.equal((await call("/login", { email: "legacy@example.com", password: "correct-horse" })).status, 200);
  assert.equal((await call("/login", { email: "legacy@example.com", password: "wrong" })).status, 401, "counting starts over");
});
