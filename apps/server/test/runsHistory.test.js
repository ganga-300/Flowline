// GET /runs and GET /runs/summary - Zap History across all of a user's Zaps.
// MOCKED: Prisma is an in-memory fake that understands the filters, ordering, take,
// select and groupBy these routes use; no database or network.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.JWT_SECRET = "test-secret";
function stub(file, exports) {
  const resolved = require.resolve(file);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// ── In-memory data: alice owns z_a1 / z_a2, bob owns z_b ──
const minute = (n) => new Date(Date.UTC(2026, 10, 1, 12, n));
let db;
let failNext = false;
function reset() {
  failNext = false;
  db = {
    zap: [
      { id: "z_a1", userId: "alice", zapName: "Gmail to Slack" },
      { id: "z_a2", userId: "alice", zapName: "GitHub issues digest" },
      { id: "z_b", userId: "bob", zapName: "Bob's secret Zap" },
    ],
    zapRun: [
      { id: "r1", zapId: "z_a1", status: "SUCCESS", createdAt: minute(1), triggerPayload: { big: "payload" } },
      { id: "r2", zapId: "z_a2", status: "FAILED", createdAt: minute(2), triggerPayload: {} },
      { id: "r3", zapId: "z_a1", status: "FILTERED", createdAt: minute(3), triggerPayload: {} },
      // r4 and r5 share a timestamp: the id tiebreak must keep pages stable.
      { id: "r4", zapId: "z_a1", status: "RUNNING", createdAt: minute(4), triggerPayload: {} },
      { id: "r5", zapId: "z_a2", status: "QUEUED", createdAt: minute(4), triggerPayload: {} },
      { id: "r6", zapId: "z_a1", status: "SUCCESS", createdAt: minute(6), triggerPayload: {} },
      { id: "rb", zapId: "z_b", status: "FAILED", createdAt: minute(5), triggerPayload: { email: "bob private" } },
    ],
    stepExecution: [
      { id: "e1", zapRunId: "r1", status: "SUCCESS", error: null, input: { secret: 1 }, createdAt: minute(1) },
      { id: "e2", zapRunId: "r2", status: "FAILED", error: "Slack error: channel_not_found", input: {}, createdAt: minute(2) },
    ],
  };
}

const cmp = (a, b) => (a instanceof Date ? a.getTime() : a) - (b instanceof Date ? b.getTime() : b);
function matchValue(actual, cond) {
  if (cond instanceof Date) return actual instanceof Date && actual.getTime() === cond.getTime();
  if (cond && typeof cond === "object") {
    return Object.entries(cond).every(([op, v]) => {
      if (op === "in") return v.includes(actual);
      if (op === "lt") return actual < v;
      if (op === "lte") return actual <= v;
      if (op === "gt") return actual > v;
      if (op === "gte") return actual >= v;
      if (op === "mode") return true;
      if (op === "contains") {
        return cond.mode === "insensitive" ? String(actual).toLowerCase().includes(v.toLowerCase()) : String(actual).includes(v);
      }
      throw new Error(`fake prisma: unsupported operator ${op}`);
    });
  }
  return actual === cond;
}
function matches(model, row, where = {}) {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return v.some((w) => matches(model, row, w));
    if (k === "AND") return v.every((w) => matches(model, row, w));
    if (model === "zapRun" && k === "zap") {
      const parent = db.zap.find((z) => z.id === row.zapId);
      return parent && matches("zap", parent, v);
    }
    // id comparisons (cursor tiebreak) are string comparisons, like Postgres text.
    if (k === "id" && v && typeof v === "object" && ("lt" in v || "gt" in v)) {
      return ("lt" in v ? row.id < v.lt : true) && ("gt" in v ? row.id > v.gt : true);
    }
    return matchValue(row[k], v);
  });
}
function order(rows, orderBy = []) {
  return [...rows].sort((a, b) => {
    for (const o of orderBy) {
      const [[key, dir]] = Object.entries(o);
      const c = key === "id" ? a.id.localeCompare(b.id) : cmp(a[key], b[key]);
      if (c) return dir === "desc" ? -c : c;
    }
    return 0;
  });
}
function project(row, select) {
  if (!select) return row;
  const out = {};
  for (const [k, v] of Object.entries(select)) {
    if (k === "zap") out.zap = project(db.zap.find((z) => z.id === row.zapId), v.select);
    else if (k === "stepExecutions") out.stepExecutions = order(db.stepExecution.filter((e) => e.zapRunId === row.id), [v.orderBy]).map((e) => project(e, v.select));
    else if (v) out[k] = row[k];
  }
  return out;
}

const queries = [];
stub(path.join(__dirname, "../src/prismaClient.js"), {
  zapRun: {
    findMany: async (args) => {
      queries.push(args);
      if (failNext) throw new Error("database is down");
      const rows = order(db.zapRun.filter((r) => matches("zapRun", r, args.where)), args.orderBy);
      return rows.slice(0, args.take ?? rows.length).map((r) => project(r, args.select));
    },
    groupBy: async ({ by, where, _count }) => {
      if (failNext) throw new Error("database is down");
      assert.deepEqual(by, ["status"]);
      assert.deepEqual(_count, { _all: true });
      const groups = {};
      for (const r of db.zapRun.filter((row) => matches("zapRun", row, where))) groups[r.status] = (groups[r.status] || 0) + 1;
      return Object.entries(groups).map(([status, n]) => ({ status, _count: { _all: n } }));
    },
  },
});

const runsRouter = require("../src/routes/runs");
const route = (p) => runsRouter.stack.find((l) => l.route?.path === p && l.route.methods.get).route.stack.at(-1).handle;
const list = route("/");
const summary = route("/summary");

async function call(handler, userId, query = {}) {
  const out = { status: 200 };
  await handler({ userId, query, params: {}, body: {} }, {
    status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; },
  });
  return out;
}
const ids = (out) => out.body.runs.map((r) => r.id);

beforeEach(() => { reset(); queries.length = 0; });

test("lists only the user's runs, newest first, with Zap name and step summaries", async () => {
  const out = await call(list, "alice");
  assert.equal(out.status, 200);
  assert.deepEqual(ids(out), ["r6", "r5", "r4", "r3", "r2", "r1"], "createdAt desc, then id desc");
  assert.equal(out.body.nextCursor, null);
  assert.doesNotMatch(JSON.stringify(out.body), /bob private|Bob's secret/);

  const r2 = out.body.runs.find((r) => r.id === "r2");
  assert.deepEqual(r2.zap, { id: "z_a2", zapName: "GitHub issues digest" });
  assert.deepEqual(r2.stepExecutions, [{ id: "e2", status: "FAILED", error: "Slack error: channel_not_found" }]);
  assert.equal(r2.triggerPayload, undefined, "trigger data is loaded with the run trace, not the list");
  assert.doesNotMatch(JSON.stringify(out.body), /secret/, "step input is not in the list");
});

test("another user's Zap id or run ids return nothing of theirs", async () => {
  assert.deepEqual(ids(await call(list, "alice", { zapId: "z_b" })), []);
  assert.deepEqual(ids(await call(list, "alice", { ids: "rb,r1" })), ["r1"]);
  const counts = (await call(summary, "alice", { zapId: "z_b" })).body.counts;
  assert.equal(counts.ALL, 0);
  for (const q of queries) assert.deepEqual(q.where.zap.userId, "alice", "every query is scoped to the user");
});

test("filters by status (one or several), Zap, date range and Zap name", async () => {
  assert.deepEqual(ids(await call(list, "alice", { status: "FAILED" })), ["r2"]);
  assert.deepEqual(ids(await call(list, "alice", { status: "running,QUEUED" })), ["r5", "r4"]);
  assert.deepEqual(ids(await call(list, "alice", { status: "ALL" })).length, 6);
  assert.deepEqual(ids(await call(list, "alice", { zapId: "z_a2" })), ["r5", "r2"]);
  assert.deepEqual(ids(await call(list, "alice", { from: minute(3).toISOString(), to: minute(4).toISOString() })), ["r5", "r4", "r3"]);
  assert.deepEqual(ids(await call(list, "alice", { from: minute(5).toISOString() })), ["r6"]);
  assert.deepEqual(ids(await call(list, "alice", { q: "github" })), ["r5", "r2"], "case-insensitive Zap name search");
  assert.deepEqual(ids(await call(list, "alice", { q: "secret" })), [], "search never reaches other users' Zaps");
  assert.deepEqual(ids(await call(list, "alice", { zapId: "z_a1", status: "SUCCESS" })), ["r6", "r1"]);
});

test("cursor pagination walks every run exactly once, including runs with the same timestamp", async () => {
  const seen = [];
  let cursor;
  let pages = 0;
  do {
    const out = await call(list, "alice", { limit: "2", ...(cursor && { cursor }) });
    assert.equal(out.status, 200);
    assert.ok(out.body.runs.length <= 2);
    seen.push(...ids(out));
    cursor = out.body.nextCursor;
    pages++;
  } while (cursor && pages < 10);
  assert.deepEqual(seen, ["r6", "r5", "r4", "r3", "r2", "r1"]);
  assert.equal(pages, 3);
});

test("the last full page has no next cursor; pagination keeps the other filters", async () => {
  const first = await call(list, "alice", { zapId: "z_a1", limit: "2" });
  assert.deepEqual(ids(first), ["r6", "r4"]);
  const second = await call(list, "alice", { zapId: "z_a1", limit: "2", cursor: first.body.nextCursor });
  assert.deepEqual(ids(second), ["r3", "r1"]);
  assert.equal(second.body.nextCursor, null);
});

test("limit defaults to 25 and is capped at 100", async () => {
  await call(list, "alice");
  assert.equal(queries.at(-1).take, 26, "25 + 1 to detect a next page");
  await call(list, "alice", { limit: "500" });
  assert.equal(queries.at(-1).take, 101);
});

test("bad input is a 400 with a message, and nothing is queried", async () => {
  const bad = [
    { status: "DONE" },
    { status: "SUCCESS,NOPE" },
    { status: "," },
    { from: "yesterday" },
    { to: "2026-13-45" },
    { from: minute(5).toISOString(), to: minute(1).toISOString() },
    { cursor: "not-a-cursor" },
    { cursor: Buffer.from("garbage|").toString("base64url") },
    { limit: "0" },
    { limit: "-5" },
    { limit: "ten" },
    { status: ["FAILED", "SUCCESS"] },
    { q: "x".repeat(101) },
    { ids: Array.from({ length: 101 }, (_, i) => `r${i}`).join(",") },
  ];
  for (const query of bad) {
    const out = await call(list, "alice", query);
    assert.equal(out.status, 400, JSON.stringify(query));
    assert.equal(typeof out.body.error, "string");
  }
  assert.equal(queries.length, 0);
  assert.equal((await call(summary, "alice", { from: "nope" })).status, 400);
});

test("a database error is a 500 with an error, never an empty list", async () => {
  failNext = true;
  const out = await call(list, "alice");
  assert.equal(out.status, 500);
  assert.equal(out.body.runs, undefined);
  assert.match(out.body.error, /Failed to load/);
  const sum = await call(summary, "alice");
  assert.equal(sum.status, 500);
  assert.equal(sum.body.counts, undefined);
});

test("GET /runs/summary counts per status under the other filters, ignoring status", async () => {
  const out = await call(summary, "alice", { status: "FAILED" });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.counts, { ALL: 6, QUEUED: 1, RUNNING: 1, SUCCESS: 2, FAILED: 1, FILTERED: 1 });

  const z1 = await call(summary, "alice", { zapId: "z_a1", from: minute(3).toISOString() });
  assert.deepEqual(z1.body.counts, { ALL: 3, QUEUED: 0, RUNNING: 1, SUCCESS: 1, FAILED: 0, FILTERED: 1 });

  const bob = await call(summary, "bob");
  assert.deepEqual(bob.body.counts, { ALL: 1, QUEUED: 0, RUNNING: 0, SUCCESS: 0, FAILED: 1, FILTERED: 0 });
});

test("GET /runs?ids= refreshes specific runs regardless of the list filters", async () => {
  const out = await call(list, "alice", { ids: "r4, r5,r4", status: "FAILED" });
  assert.deepEqual(ids(out), ["r5", "r4"]);
  assert.equal(out.body.nextCursor, null);
});
