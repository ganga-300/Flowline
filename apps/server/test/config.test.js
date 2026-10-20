// Startup environment checks and CORS origins (pure).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { checkEnv, allowedOrigins, redisUrl } = require("../src/config");

const quiet = { warn: () => {} };
const base = { DATABASE_URL: "postgres://x", JWT_SECRET: "s" };

test("development: only the database and JWT secret are required", () => {
  assert.doesNotThrow(() => checkEnv("server", base, quiet));
  assert.throws(() => checkEnv("server", { DATABASE_URL: "x" }, quiet), /JWT_SECRET/);
  assert.doesNotThrow(() => checkEnv("worker", { DATABASE_URL: "x" }, quiet));
});

test("production also requires Redis, the encryption key and the frontend URL (server)", () => {
  const err = (() => { try { checkEnv("server", { ...base, NODE_ENV: "production" }, quiet); } catch (e) { return e.message; } })();
  assert.match(err, /REDIS_URL, TOKEN_ENCRYPTION_KEY, FRONTEND_URL/);
  assert.throws(() => checkEnv("worker", { DATABASE_URL: "x", NODE_ENV: "production" }, quiet), /REDIS_URL, TOKEN_ENCRYPTION_KEY$|REDIS_URL, TOKEN_ENCRYPTION_KEY\./);
  assert.doesNotThrow(() => checkEnv("server", { ...base, NODE_ENV: "production", REDIS_URL: "redis://r", TOKEN_ENCRYPTION_KEY: "k", FRONTEND_URL: "https://app.example" }, quiet));
});

test("an app without OAuth settings only warns", () => {
  const warnings = [];
  checkEnv("server", { ...base, GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "s" }, { warn: (m) => warnings.push(m) });
  assert.equal(warnings.some((w) => w.includes("Gmail")), true);
  assert.equal(warnings.some((w) => w.includes("GitHub")), false);
});

test("FRONTEND_URL may list several origins; trailing slashes are ignored", () => {
  assert.deepEqual(allowedOrigins({ FRONTEND_URL: "https://flowline.vercel.app/, http://localhost:3000" }), ["https://flowline.vercel.app", "http://localhost:3000"]);
  assert.deepEqual(allowedOrigins({}), ["http://localhost:3000"]);
});

test("Redis defaults to the local dev port", () => {
  const saved = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  assert.equal(redisUrl(), "redis://localhost:6380");
  process.env.REDIS_URL = "redis://red-abc:6379";
  assert.equal(redisUrl(), "redis://red-abc:6379");
  if (saved === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = saved;
});
