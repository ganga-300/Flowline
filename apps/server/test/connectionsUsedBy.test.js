// GET /connections: each connected account lists the user's Zaps that use it (`usedBy`).
// MOCKED: Prisma is an in-memory fake that understands the one findMany + include the
// route makes; it also counts queries so we can prove there is no query per connection.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.JWT_SECRET = "test-secret";
function stub(file, exports) {
  const resolved = require.resolve(file);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// ── In-memory data: alice owns conn_slack / conn_gh and three Zaps; bob owns z_bob ──
let db;
let queries;
function reset() {
  queries = 0;
  db = {
    zap: [
      { id: "z_1", userId: "alice", zapName: "Standup digest", status: "ENABLED" },
      { id: "z_2", userId: "alice", zapName: "Alert on push", status: "DISABLED" },
      { id: "z_3", userId: "alice", zapName: "Unused", status: "ENABLED" },
      { id: "z_bob", userId: "bob", zapName: "Bob's zap", status: "ENABLED" },
    ],
    connection: [
      { id: "conn_slack", userId: "alice", provider: "slack:Acme", createdAt: new Date("2026-01-02"), accessToken: "secret-1" },
      { id: "conn_gh", userId: "alice", provider: "github:octo", createdAt: new Date("2026-01-01"), accessToken: "secret-2" },
      { id: "conn_bob", userId: "bob", provider: "slack:Bob", createdAt: new Date("2026-01-03"), accessToken: "secret-3" },
    ],
    // z_1 uses Slack as its trigger AND in two steps; z_2 posts to Slack and reads GitHub.
    trigger: [
      { id: "t_1", zapId: "z_1", connectionId: "conn_slack" },
      { id: "t_2", zapId: "z_2", connectionId: "conn_gh" },
      { id: "t_bob", zapId: "z_bob", connectionId: "conn_slack" }, // not alice's Zap: must not show up
    ],
    step: [
      { id: "s_1", zapId: "z_1", connectionId: "conn_slack" },
      { id: "s_2", zapId: "z_1", connectionId: "conn_slack" },
      { id: "s_3", zapId: "z_2", connectionId: "conn_slack" },
      { id: "s_4", zapId: "z_3", connectionId: null },
    ],
  };
}

const zapOf = (row) => db.zap.find((z) => z.id === row.zapId);
function related(model, conn, { where, select }) {
  return db[model]
    .filter((r) => r.connectionId === conn.id && (!where?.zap?.userId || zapOf(r)?.userId === where.zap.userId))
    .map((r) => {
      const zap = zapOf(r);
      return { zap: Object.fromEntries(Object.keys(select.zap.select).map((k) => [k, zap[k]])) };
    });
}

const withRelations = (c, include) => ({
  ...c,
  ...(include?.triggers && { triggers: related("trigger", c, include.triggers) }),
  ...(include?.steps && { steps: related("step", c, include.steps) }),
});
stub(path.join(__dirname, "../src/prismaClient.js"), {
  $transaction: async (ops) => Promise.all(ops),
  zap: {
    updateMany: async ({ where, data }) => {
      const hit = db.zap.filter((z) => where.id.in.includes(z.id) && z.userId === where.userId && z.status === where.status);
      for (const z of hit) Object.assign(z, data);
      return { count: hit.length };
    },
  },
  connection: {
    findUnique: async ({ where, include }) => {
      const c = db.connection.find((x) => x.id === where.id);
      return c ? withRelations(c, include) : null;
    },
    delete: async ({ where }) => { db.connection = db.connection.filter((x) => x.id !== where.id); },
    findMany: async ({ where, include }) => {
      queries++;
      return db.connection
        .filter((c) => c.userId === where.userId && (!where.provider || c.provider.startsWith(where.provider.startsWith)))
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((c) => ({
          ...c,
          ...(include?.triggers && { triggers: related("trigger", c, include.triggers) }),
          ...(include?.steps && { steps: related("step", c, include.steps) }),
        }));
    },
  },
});

const connectionsRouter = require("../src/routes/connections");
const list = connectionsRouter.stack.find((l) => l.route?.path === "/" && l.route.methods.get).route.stack.at(-1).handle;

async function call(req) {
  const out = { status: 200 };
  await list({ query: {}, params: {}, ...req }, {
    status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; },
  });
  return out;
}

beforeEach(reset);

test("each connection lists the distinct Zaps that use it, via trigger or steps", async () => {
  const out = await call({ userId: "alice" });
  assert.equal(out.status, 200);
  const byId = Object.fromEntries(out.body.connections.map((c) => [c.id, c]));
  assert.deepEqual(byId.conn_slack.usedBy, [
    { zapId: "z_2", zapName: "Alert on push", status: "DISABLED" },
    { zapId: "z_1", zapName: "Standup digest", status: "ENABLED" },
  ], "z_1 counted once even though its trigger and two steps use the account");
  assert.deepEqual(byId.conn_gh.usedBy, [{ zapId: "z_2", zapName: "Alert on push", status: "DISABLED" }]);
});

test("Zaps owned by other users never appear in usedBy", async () => {
  const out = await call({ userId: "alice" });
  assert.doesNotMatch(JSON.stringify(out.body), /z_bob|Bob's zap/);
});

test("keeps the existing fields, hides tokens, and uses a single query", async () => {
  const out = await call({ userId: "alice" });
  assert.equal(queries, 1);
  assert.deepEqual(Object.keys(out.body.connections[0]).sort(), ["createdAt", "email", "id", "lastError", "lastErrorAt", "provider", "status", "usedBy"]);
  assert.deepEqual(out.body.connections.map((c) => [c.provider, c.email]), [["slack", "Acme"], ["github", "octo"]]);
  assert.doesNotMatch(JSON.stringify(out.body), /secret-/);
});

test("provider filter still works and unused connections get an empty list", async () => {
  db.trigger = [];
  db.step = [];
  const out = await call({ userId: "alice", query: { provider: "github" } });
  assert.deepEqual(out.body.connections.map((c) => ({ id: c.id, usedBy: c.usedBy })), [{ id: "conn_gh", usedBy: [] }]);
});

test("connections report their health: OK by default, or 'needs reconnect' with the app's error", async () => {
  db.connection[1] = { ...db.connection[1], status: "NEEDS_RECONNECT", lastError: "GitHub request failed (401): Bad credentials", lastErrorAt: new Date("2026-02-01") };
  const out = await call({ userId: "alice" });
  const byId = Object.fromEntries(out.body.connections.map((c) => [c.id, c]));
  assert.equal(byId.conn_slack.status, "OK");
  assert.equal(byId.conn_slack.lastError, null);
  assert.equal(byId.conn_gh.status, "NEEDS_RECONNECT");
  assert.match(byId.conn_gh.lastError, /Bad credentials/);
});

// ── DELETE /connections/:id ──

const remove = connectionsRouter.stack.find((l) => l.route?.path === "/:id" && l.route.methods.delete).route.stack.at(-1).handle;
async function callDelete(req) {
  const out = { status: 200 };
  await remove({ query: {}, ...req }, { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } });
  return out;
}

test("disconnecting turns off the Zaps that are on and use the account, and names them", async () => {
  const out = await callDelete({ userId: "alice", params: { id: "conn_slack" } });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.disabledZaps, [{ zapId: "z_1", zapName: "Standup digest" }], "z_2 was already off");
  assert.equal(db.zap.find((z) => z.id === "z_1").status, "DISABLED");
  assert.equal(db.zap.find((z) => z.id === "z_3").status, "ENABLED", "a Zap not using it is untouched");
  assert.equal(db.zap.find((z) => z.id === "z_bob").status, "ENABLED", "another user's Zap is never touched");
  assert.equal(db.connection.some((c) => c.id === "conn_slack"), false);
});

test("disconnecting an unused account turns nothing off", async () => {
  db.trigger = [];
  db.step = [];
  const out = await callDelete({ userId: "alice", params: { id: "conn_gh" } });
  assert.deepEqual(out.body.disabledZaps, []);
  assert.deepEqual(db.zap.map((z) => z.status), ["ENABLED", "DISABLED", "ENABLED", "ENABLED"]);
});

test("someone else's connection can't be disconnected", async () => {
  const out = await callDelete({ userId: "alice", params: { id: "conn_bob" } });
  assert.equal(out.status, 403);
  assert.equal(db.connection.length, 3);
});
