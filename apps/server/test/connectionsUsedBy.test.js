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
      { id: "z_1", userId: "alice", zapName: "Standup digest" },
      { id: "z_2", userId: "alice", zapName: "Alert on push" },
      { id: "z_3", userId: "alice", zapName: "Unused" },
      { id: "z_bob", userId: "bob", zapName: "Bob's zap" },
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

stub(path.join(__dirname, "../src/prismaClient.js"), {
  connection: {
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
    { zapId: "z_2", zapName: "Alert on push" },
    { zapId: "z_1", zapName: "Standup digest" },
  ], "z_1 counted once even though its trigger and two steps use the account");
  assert.deepEqual(byId.conn_gh.usedBy, [{ zapId: "z_2", zapName: "Alert on push" }]);
});

test("Zaps owned by other users never appear in usedBy", async () => {
  const out = await call({ userId: "alice" });
  assert.doesNotMatch(JSON.stringify(out.body), /z_bob|Bob's zap/);
});

test("keeps the existing fields, hides tokens, and uses a single query", async () => {
  const out = await call({ userId: "alice" });
  assert.equal(queries, 1);
  assert.deepEqual(Object.keys(out.body.connections[0]).sort(), ["createdAt", "email", "id", "provider", "usedBy"]);
  assert.deepEqual(out.body.connections.map((c) => [c.provider, c.email]), [["slack", "Acme"], ["github", "octo"]]);
  assert.doesNotMatch(JSON.stringify(out.body), /secret-/);
});

test("provider filter still works and unused connections get an empty list", async () => {
  db.trigger = [];
  db.step = [];
  const out = await call({ userId: "alice", query: { provider: "github" } });
  assert.deepEqual(out.body.connections.map((c) => ({ id: c.id, usedBy: c.usedBy })), [{ id: "conn_gh", usedBy: [] }]);
});
