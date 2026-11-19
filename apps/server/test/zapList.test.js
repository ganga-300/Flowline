// GET /zaps (dashboard list: broken accounts and latest run) and PATCH /zaps/:id turning a
// polling Flow back on. MOCKED: Prisma (records the queries' effects); no database.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.JWT_SECRET = "test-secret";
function stub(file, exports) {
  const resolved = require.resolve(file);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

let db, triggerResets, lastFindManyArgs;
const prisma = {
  zap: {
    findMany: async (args) => { lastFindManyArgs = args; return db.listRows; },
    findUnique: async ({ where }) => db.zaps.find((z) => z.id === where.id) || null,
    update: async ({ where, data }) => Object.assign(db.zaps.find((z) => z.id === where.id), data),
  },
  trigger: {
    updateMany: async ({ where, data }) => { triggerResets.push({ where, data }); return { count: 1 }; },
  },
  $transaction: async (fn) => fn(prisma),
};
stub(path.join(__dirname, "../src/prismaClient.js"), prisma);
stub(path.join(__dirname, "../src/Queue.js"), { zapExecutionQueue: { add: async () => {} } });

const router = require("../src/routes/zaps");
const route = (p, method) => router.stack.find((l) => l.route?.path === p && l.route.methods[method]).route.stack.at(-1).handle;
async function call(handler, req) {
  const out = { status: 200 };
  await handler({ userId: "alice", params: {}, query: {}, body: {}, ...req }, { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } });
  return out;
}

const { brokenConnections, describeConnection } = require("../src/lib/zapHealth");

beforeEach(() => {
  triggerResets = [];
  db = { zaps: [{ id: "z1", userId: "alice", status: "DISABLED" }, { id: "z2", userId: "alice", status: "ENABLED" }], listRows: [] };
});

test("brokenConnections: distinct accounts needing a reconnect, trigger first", () => {
  const slack = { id: "c1", provider: "slack:Acme", status: "NEEDS_RECONNECT", lastError: "token_revoked" };
  const gh = { id: "c2", provider: "github:octo", status: "OK", lastError: null };
  const gmail = { id: "c3", provider: "gmail:me@example.com", status: "NEEDS_RECONNECT", lastError: null };
  const zap = { trigger: { connection: gmail }, steps: [{ connection: slack }, { connection: gh }, { connection: slack }, { connection: null }] };
  assert.deepEqual(brokenConnections(zap), [
    { connectionId: "c3", app: "gmail", account: "me@example.com", lastError: null },
    { connectionId: "c1", app: "slack", account: "Acme", lastError: "token_revoked" },
  ]);
  assert.deepEqual(brokenConnections({ trigger: null, steps: [] }), []);
  assert.deepEqual(describeConnection("github"), { app: "github", account: "" });
});

test("GET /zaps: each Flow has its latest run and broken accounts, never tokens or step rows", async () => {
  db.listRows = [{
    id: "z1", zapName: "Digest", status: "ENABLED",
    trigger: { id: "t1", type: "POLLING", config: {}, connection: { id: "c1", provider: "slack:Acme", status: "NEEDS_RECONNECT", lastError: "token_revoked" } },
    steps: [{ connection: { id: "c2", provider: "github:octo", status: "OK", lastError: null } }],
    runs: [{ id: "r9", status: "FAILED", createdAt: "2026-11-18T10:00:00Z", completedAt: "2026-11-18T10:00:01Z" }],
  }];
  const out = await call(route("/", "get"), {});
  const [zap] = out.body.zaps;
  assert.equal(zap.lastRun.status, "FAILED");
  assert.deepEqual(zap.brokenConnections.map((c) => c.connectionId), ["c1"]);
  assert.equal("steps" in zap, false);
  assert.equal("runs" in zap, false);
  // The query selects connection fields explicitly, so tokens are never loaded.
  const select = lastFindManyArgs.include.trigger.include.connection.select;
  assert.equal(select.accessToken, undefined);
  assert.equal(lastFindManyArgs.include.runs.take, 1);
});

test("PATCH: turning a Flow back on resets its polling checkpoint (starts fresh, no replay)", async () => {
  const out = await call(route("/:id", "patch"), { params: { id: "z1" }, body: { status: "ENABLED" } });
  assert.equal(out.status, 200);
  assert.deepEqual(triggerResets, [{ where: { zapId: "z1", type: "POLLING" }, data: { lastPollHash: null } }]);
});

test("PATCH: renaming, pausing, or 'enabling' a Flow that's already on keeps the checkpoint", async () => {
  await call(route("/:id", "patch"), { params: { id: "z2" }, body: { status: "ENABLED" } });
  await call(route("/:id", "patch"), { params: { id: "z2" }, body: { status: "DISABLED" } });
  await call(route("/:id", "patch"), { params: { id: "z1" }, body: { name: "New name" } });
  assert.deepEqual(triggerResets, []);
});
