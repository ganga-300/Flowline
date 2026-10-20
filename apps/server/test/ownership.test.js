// Ownership checks: a logged-in user must not read or use another user's Zaps, runs,
// trigger samples or connected accounts. MOCKED: Prisma is an in-memory fake that
// understands the nested `where` filters these routes use; no database or network.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.JWT_SECRET = "test-secret";
function stub(file, exports) {
  const resolved = require.resolve(file);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// ── In-memory data: alice owns z_a / conn_a, bob owns z_b / conn_b ──
let db;
function reset() {
  db = {
    zap: [{ id: "z_a", userId: "alice", zapName: "A" }, { id: "z_b", userId: "bob", zapName: "B" }],
    trigger: [{ id: "t_a", zapId: "z_a", webhookToken: "secret-a" }, { id: "t_b", zapId: "z_b", webhookToken: "secret-b" }],
    zapRun: [{ id: "r_a", zapId: "z_a", status: "SUCCESS", triggerPayload: { email: { subject: "alice private" } } },
             { id: "r_b", zapId: "z_b", status: "SUCCESS", triggerPayload: { email: { subject: "bob private" } } }],
    connection: [{ id: "conn_a", userId: "alice", provider: "slack:A", accessToken: "a-token" },
                 { id: "conn_b", userId: "bob", provider: "slack:B", accessToken: "b-token" }],
  };
}
const relation = { zapRun: { zap: "zap" }, trigger: { zap: "zap" } };
function matches(model, row, where = {}) {
  return Object.entries(where).every(([k, v]) => {
    if (relation[model]?.[k]) {
      const parent = db.zap.find((z) => z.id === row.zapId);
      return parent && matches("zap", parent, v);
    }
    if (v && typeof v === "object" && "in" in v) return v.in.includes(row[k]);
    if (v && typeof v === "object" && "startsWith" in v) return String(row[k]).startsWith(v.startsWith);
    return row[k] === v;
  });
}
const model = (name) => ({
  findFirst: async ({ where } = {}) => db[name].find((r) => matches(name, r, where)) || null,
  findUnique: async ({ where } = {}) => db[name].find((r) => matches(name, r, where)) || null,
  findMany: async ({ where } = {}) => db[name].filter((r) => matches(name, r, where)),
  count: async ({ where } = {}) => db[name].filter((r) => matches(name, r, where)).length,
  create: async ({ data }) => { const row = { id: `${name}_${db[name].length + 1}`, ...data }; db[name].push(row); return row; },
});
const created = [];
stub(path.join(__dirname, "../src/prismaClient.js"), {
  zap: { ...model("zap"), create: async ({ data }) => { created.push(data); return { id: "z_new", ...data }; } },
  trigger: model("trigger"), zapRun: model("zapRun"), connection: model("connection"),
});
stub(path.join(__dirname, "../src/Queue.js"), { zapExecutionQueue: { add: async () => {} } });

let handlerCalls = 0;
stub(path.join(__dirname, "../../worker/src/integrations/registry.js"), {
  getIntegrationHandler: () => async () => { handlerCalls++; return { output: { status: "SENT" } }; },
});

const zapsRouter = require("../src/routes/zaps");
const testStepRouter = require("../src/routes/testStep");
const route = (router, p, method) =>
  router.stack.find((l) => l.route?.path === p && l.route.methods[method]).route.stack.at(-1).handle;

async function call(handler, req) {
  const out = { status: 200 };
  await handler({ query: {}, body: {}, params: {}, ...req }, {
    status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; },
  });
  return out;
}

beforeEach(() => { reset(); created.length = 0; handlerCalls = 0; });

test("GET /zaps/:id - own zap visible, other user's zap is 404 (webhook token not leaked)", async () => {
  const h = route(zapsRouter, "/:id", "get");
  assert.equal((await call(h, { userId: "alice", params: { id: "z_a" } })).status, 200);
  const out = await call(h, { userId: "alice", params: { id: "z_b" } });
  assert.equal(out.status, 404);
  assert.doesNotMatch(JSON.stringify(out.body), /secret-b/);
});

test("GET /zaps/:id/runs - other user's runs are 404", async () => {
  const h = route(zapsRouter, "/:id/runs", "get");
  const own = await call(h, { userId: "alice", params: { id: "z_a" } });
  assert.deepEqual(own.body.runs.map((r) => r.id), ["r_a"]);
  const other = await call(h, { userId: "alice", params: { id: "z_b" } });
  assert.equal(other.status, 404);
  assert.doesNotMatch(JSON.stringify(other.body), /bob private/);
});

test("GET /zaps/:id/runs/:runId - run must belong to that zap AND the user", async () => {
  const h = route(zapsRouter, "/:id/runs/:runId", "get");
  assert.equal((await call(h, { userId: "alice", params: { id: "z_a", runId: "r_a" } })).status, 200);
  assert.equal((await call(h, { userId: "alice", params: { id: "z_b", runId: "r_b" } })).status, 404);
  assert.equal((await call(h, { userId: "alice", params: { id: "z_a", runId: "r_b" } })).status, 404, "bob's run via alice's zap id");
});

test("GET /zaps/test-step/sample/:triggerId - other user's trigger data is 404", async () => {
  const h = route(testStepRouter, "/sample/:triggerId", "get");
  assert.equal((await call(h, { userId: "alice", params: { triggerId: "t_a" } })).status, 200);
  const other = await call(h, { userId: "alice", params: { triggerId: "t_b" } });
  assert.equal(other.status, 404);
  assert.doesNotMatch(JSON.stringify(other.body), /bob private/);
});

test("POST /zaps - cannot publish a Zap that uses another user's connected account", async () => {
  const h = route(zapsRouter, "/", "post");
  const body = (triggerConn, stepConn) => ({
    name: "x",
    trigger: { type: "POLLING", config: { provider: "slack", connectionId: triggerConn } },
    steps: [{ type: "ACTION", name: "s", order: 0, connectionId: stepConn, config: { provider: "slack", action: "send_message", connectionId: stepConn } }],
  });
  assert.equal((await call(h, { userId: "alice", body: body("conn_a", "conn_a") })).status, 201);
  assert.equal((await call(h, { userId: "alice", body: body("conn_b", "conn_a") })).status, 400);
  assert.equal((await call(h, { userId: "alice", body: body("conn_a", "conn_b") })).status, 400);
  assert.equal(created.length, 1, "only the valid Zap was created");
});

test("POST /zaps/test-step - cannot run an action with another user's connected account", async () => {
  const h = route(testStepRouter, "/", "post");
  const step = (conn) => ({ type: "ACTION", config: { provider: "slack", action: "send_message", connectionId: conn, config: {} } });
  const own = await call(h, { userId: "alice", body: { step: step("conn_a") } });
  assert.equal(own.body.status, "SUCCESS");
  const other = await call(h, { userId: "alice", body: { step: step("conn_b") } });
  assert.equal(other.status, 404);
  assert.equal(handlerCalls, 1, "handler never ran with bob's account");
});
