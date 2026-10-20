// PUT /zaps/:id - editing a published Zap.
// MOCKED: Prisma is an in-memory fake (with $transaction); no database or network.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.JWT_SECRET = "test-secret";
function stub(file, exports) {
  const resolved = require.resolve(file);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

let db;
let seq = 0;
function reset() {
  seq = 0;
  db = {
    zap: [{ id: "z1", userId: "alice", zapName: "Old name", status: "ENABLED" }, { id: "z2", userId: "bob", zapName: "Bob's", status: "ENABLED" }],
    trigger: [{ id: "t1", zapId: "z1", type: "POLLING", connectionId: "c_gh", config: { provider: "github", event: "new_issue", repo: "o/a", connectionId: "c_gh" }, pollIntervalSec: 300, lastPollHash: "101", webhookToken: null }],
    step: [
      { id: "s1", zapId: "z1", type: "ACTION", name: "Slack", order: 0, connectionId: "c_sl", parentStepId: null, config: { provider: "slack", action: "send_message", ref: "step-1", config: { channel: "C1", text: "old" } } },
      { id: "s2", zapId: "z1", type: "ACTION", name: "Comment", order: 1, connectionId: "c_gh", parentStepId: null, config: { provider: "github", action: "add_comment", ref: "step-2", config: {} } },
    ],
    stepExecution: [{ id: "e1", stepId: "s1" }, { id: "e2", stepId: "s2" }],
    connection: [{ id: "c_gh", userId: "alice" }, { id: "c_sl", userId: "alice" }, { id: "c_bob", userId: "bob" }],
  };
}
function matches(row, where = {}) {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && "in" in v) return v.in.includes(row[k]);
    if (v && typeof v === "object" && "notIn" in v) return !v.notIn.includes(row[k]);
    return row[k] === v;
  });
}
const withRelations = (name, row, include) => {
  if (!row || !include) return row;
  const out = { ...row };
  if (name === "zap" && include.trigger) out.trigger = db.trigger.find((t) => t.zapId === row.id) || null;
  if (name === "zap" && include.steps) out.steps = db.step.filter((s) => s.zapId === row.id).sort((a, b) => a.order - b.order);
  return out;
};
const model = (name) => ({
  findFirst: async ({ where, include } = {}) => withRelations(name, db[name].find((r) => matches(r, where)) || null, include),
  findMany: async ({ where } = {}) => db[name].filter((r) => matches(r, where)),
  count: async ({ where } = {}) => db[name].filter((r) => matches(r, where)).length,
  create: async ({ data }) => { const row = { id: `${name}_new${++seq}`, parentStepId: null, ...data }; db[name].push(row); return row; },
  update: async ({ where, data }) => { const row = db[name].find((r) => r.id === where.id); Object.assign(row, data); return row; },
  deleteMany: async ({ where }) => {
    const gone = db[name].filter((r) => matches(r, where)).map((r) => r.id);
    db[name] = db[name].filter((r) => !gone.includes(r.id));
    if (name === "step") db.stepExecution = db.stepExecution.filter((e) => !gone.includes(e.stepId)); // onDelete: Cascade
    return { count: gone.length };
  },
});
const prisma = { zap: model("zap"), trigger: model("trigger"), step: model("step"), connection: model("connection") };
prisma.$transaction = async (fn) => fn(prisma);
stub(path.join(__dirname, "../src/prismaClient.js"), prisma);
stub(path.join(__dirname, "../src/Queue.js"), { zapExecutionQueue: { add: async () => {} } });

const handler = require("../src/routes/zaps").stack.find((l) => l.route?.path === "/:id" && l.route.methods.put).route.stack.at(-1).handle;
async function put(userId, id, body) {
  const out = { status: 200 };
  await handler({ userId, params: { id }, body, query: {} }, { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } });
  return out;
}

const githubTrigger = (extra = {}) => ({ type: "POLLING", connectionId: "c_gh", pollIntervalSec: 300, config: { provider: "github", event: "new_issue", repo: "o/a", connectionId: "c_gh", ...extra } });
const slackStep = (extra = {}) => ({ id: "s1", type: "ACTION", name: "Slack", order: 0, connectionId: "c_sl", config: { provider: "slack", action: "send_message", ref: "step-1", config: { channel: "C1", text: "new text" } }, ...extra });

beforeEach(reset);

test("updates name, edits a step in place (same id, run history kept) and removes a deleted step", async () => {
  const out = await put("alice", "z1", { name: "New name", trigger: githubTrigger(), steps: [slackStep()] });
  assert.equal(out.status, 200);
  assert.equal(db.zap[0].zapName, "New name");
  assert.deepEqual(db.step.map((s) => s.id), ["s1"]);
  assert.equal(db.step[0].config.config.text, "new text");
  assert.equal(db.step[0].config.ref, "step-1", "ref kept so {{steps.step-1...}} still resolves");
  assert.deepEqual(db.stepExecution.map((e) => e.id), ["e1"], "history of the edited step kept");
  assert.equal(out.body.zap.steps.length, 1);
});

test("adds new steps and reorders existing ones", async () => {
  const added = { type: "ACTION", name: "Email", order: 0, connectionId: "c_gh", config: { provider: "github", action: "create_issue", ref: "step-9", config: {} } };
  await put("alice", "z1", { name: "x", trigger: githubTrigger(), steps: [added, { ...slackStep(), order: 1 }] });
  assert.equal(db.step.length, 2);
  assert.equal(db.step.find((s) => s.id === "s1").order, 1);
  const created = db.step.find((s) => s.id !== "s1");
  assert.equal(created.zapId, "z1");
  assert.equal(created.config.ref, "step-9");
});

test("unchanged trigger keeps its polling position", async () => {
  await put("alice", "z1", { name: "x", trigger: githubTrigger(), steps: [slackStep()] });
  assert.equal(db.trigger[0].lastPollHash, "101");
});

test("watching a different repo resets the polling position (no runs for old items of the new repo)", async () => {
  await put("alice", "z1", { name: "x", trigger: githubTrigger({ repo: "o/b" }), steps: [slackStep()] });
  assert.equal(db.trigger[0].lastPollHash, null);
  assert.equal(db.trigger[0].config.repo, "o/b");
});

test("switching to a webhook trigger gets a webhook token", async () => {
  await put("alice", "z1", { name: "x", trigger: { type: "WEBHOOK", config: { provider: "webhook", event: "catch_hook" } }, steps: [slackStep()] });
  assert.equal(db.trigger[0].type, "WEBHOOK");
  assert.match(db.trigger[0].webhookToken, /^[0-9a-f]{32}$/);
  assert.equal(db.trigger[0].connectionId, null);
});

test("another user's Zap is 404 and unchanged", async () => {
  const out = await put("alice", "z2", { name: "hijack", trigger: githubTrigger(), steps: [] });
  assert.equal(out.status, 404);
  assert.equal(db.zap[1].zapName, "Bob's");
});

test("another user's account or a step from another Zap is rejected without changes", async () => {
  let out = await put("alice", "z1", { name: "x", trigger: githubTrigger(), steps: [slackStep({ connectionId: "c_bob" })] });
  assert.equal(out.status, 400);
  out = await put("alice", "z1", { name: "x", trigger: githubTrigger(), steps: [slackStep({ id: "s_other_zap" })] });
  assert.equal(out.status, 400);
  assert.equal(db.zap[0].zapName, "Old name");
  assert.equal(db.step.length, 2);
});

test("missing name or trigger type is a 400", async () => {
  assert.equal((await put("alice", "z1", { trigger: githubTrigger(), steps: [] })).status, 400);
  assert.equal((await put("alice", "z1", { name: "x", trigger: {}, steps: [] })).status, 400);
});
