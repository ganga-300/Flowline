// Connection health helpers: which errors mean "the app rejected this account", and the
// Connection rows they write. MOCKED: Prisma (records writes).
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const workerSrc = path.join(__dirname, "../src");
let writes, failWrites;
const prismaPath = require.resolve(path.join(workerSrc, "prismaClient"));
require.cache[prismaPath] = {
  id: prismaPath, filename: prismaPath, loaded: true,
  exports: {
    connection: {
      update: async (args) => { if (failWrites) throw new Error("db down"); writes.push(["update", args]); },
      updateMany: async (args) => { if (failWrites) throw new Error("db down"); writes.push(["updateMany", args]); return { count: 1 }; },
    },
  },
};

const { isAuthFailure, stepConnectionId, markConnectionBroken, markConnectionHealthy, noteConnectionError } = require("../src/connectionHealth");
const { slackApiError } = require("../src/integrations/slack/errors");
const { shouldCancelRun, FINISHED_RUN_STATUSES } = require("../src/runGate");

beforeEach(() => {
  writes = [];
  failWrites = false;
});

test("auth failures: 401s, Slack token codes, and errors tagged authFailed", () => {
  assert.equal(isAuthFailure(Object.assign(new Error("x"), { status: 401 })), true);
  assert.equal(isAuthFailure(Object.assign(new Error("x"), { authFailed: true })), true);
  for (const code of ["invalid_auth", "not_authed", "token_revoked", "token_expired", "account_inactive"]) {
    assert.equal(isAuthFailure(slackApiError(code)), true, code);
  }
});

test("not auth failures: rate limits, outages, missing permissions, bad input", () => {
  for (const status of [403, 404, 429, 500, 503]) assert.equal(isAuthFailure(Object.assign(new Error("x"), { status })), false, String(status));
  for (const code of ["ratelimited", "channel_not_found", "missing_scope", "not_in_channel"]) assert.equal(isAuthFailure(slackApiError(code)), false, code);
  assert.equal(isAuthFailure(new Error("fetch failed")), false);
  assert.equal(isAuthFailure(null), false);
});

test("a step's connection: flat (API-created Zaps), in config, or nested by the builder", () => {
  assert.equal(stepConnectionId({ connectionId: "a" }), "a");
  assert.equal(stepConnectionId({ config: { connectionId: "b" } }), "b");
  assert.equal(stepConnectionId({ config: { config: { connectionId: "c" } } }), "c");
  assert.equal(stepConnectionId({ config: {} }), null);
});

test("markConnectionBroken stores the status, a short error and when - only the first time", async () => {
  await markConnectionBroken("c1", new Error("x".repeat(2000)));
  const [kind, args] = writes[0];
  assert.equal(kind, "updateMany");
  assert.deepEqual(args.where, { id: "c1", status: { not: "NEEDS_RECONNECT" } }, "an already-broken account keeps its first error and date");
  assert.equal(args.data.status, "NEEDS_RECONNECT");
  assert.equal(args.data.lastError.length, 500);
  assert.ok(args.data.lastErrorAt instanceof Date);
});

test("health bookkeeping never throws (a deleted connection or a database blip)", async () => {
  failWrites = true;
  await markConnectionBroken("c1", new Error("x"));
  await markConnectionHealthy("c1");
});

test("markConnectionHealthy: no query for an account already OK; conditional update otherwise", async () => {
  await markConnectionHealthy({ id: "c1", status: "OK" });
  await markConnectionHealthy(null);
  assert.equal(writes.length, 0);

  await markConnectionHealthy({ id: "c1", status: "NEEDS_RECONNECT" });
  await markConnectionHealthy("c2");
  assert.deepEqual(writes.map(([kind, a]) => [kind, a.where]), [
    ["updateMany", { id: "c1", status: "NEEDS_RECONNECT" }],
    ["updateMany", { id: "c2", status: "NEEDS_RECONNECT" }],
  ]);
});

test("noteConnectionError only marks auth failures", async () => {
  assert.equal(await noteConnectionError("c1", slackApiError("channel_not_found")), false);
  assert.equal(await noteConnectionError(null, slackApiError("token_revoked")), false);
  assert.equal(writes.length, 0);
  assert.equal(await noteConnectionError("c1", slackApiError("token_revoked")), true);
  assert.equal(writes.length, 1);
});

test("runs of a Zap that is off or deleted are cancelled; CANCELLED counts as finished", () => {
  assert.equal(shouldCancelRun({ status: "ENABLED" }), false);
  assert.equal(shouldCancelRun({ status: "DISABLED" }), true);
  assert.equal(shouldCancelRun(null), true);
  assert.ok(FINISHED_RUN_STATUSES.includes("CANCELLED"));
});
