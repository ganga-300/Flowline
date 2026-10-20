// POST /webhooks/:token - one run and one job per event, even across a crash.
// MOCKED: Prisma (in-memory) and the BullMQ queue (ignores duplicate job ids like BullMQ).
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function stub(file, exports) {
  const resolved = require.resolve(file);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
let runs, jobs, queueDown;
stub(path.join(__dirname, "../src/prismaClient.js"), {
  trigger: { findUnique: async () => ({ id: "t1", zapId: "z1", zap: { status: "ENABLED" } }) },
  zapRun: {
    create: async ({ data }) => {
      if (runs.some((r) => r.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error("dup"), { code: "P2002" });
      const r = { id: `run_${runs.length + 1}`, ...data }; runs.push(r); return r;
    },
    findUnique: async ({ where }) => runs.find((r) => r.idempotencyKey === where.idempotencyKey) || null,
  },
});
stub(path.join(__dirname, "../src/Queue.js"), { zapExecutionQueue: { add: async (n, d, o) => {
  if (queueDown) throw new Error("redis down");
  if (!jobs.has(o?.jobId)) jobs.set(o?.jobId, d);
} } });

const handler = require("../src/routes/webhooks").stack.find((l) => l.route?.path === "/:token").route.stack.at(-1).handle;
async function post(body) {
  const out = {};
  await handler({ params: { token: "tok" }, body }, { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } });
  return out;
}
beforeEach(() => { runs = []; jobs = new Map(); queueDown = false; });

test("new event: one run, queued once", async () => {
  const out = await post({ id: 1 });
  assert.equal(out.status, 202);
  assert.equal(runs.length, 1);
  assert.deepEqual([...jobs.keys()], [`zap-run-${runs[0].id}`]);
});

test("same event delivered twice: still one run and one job", async () => {
  await post({ id: 1 });
  const again = await post({ id: 1 });
  assert.equal(again.body.duplicate, true);
  assert.equal(runs.length, 1);
  assert.equal(jobs.size, 1);
});

test("queue failed after the run was saved: the provider's retry queues it", async () => {
  queueDown = true;
  await post({ id: 1 }).catch(() => {});
  assert.equal(runs.length, 1);
  assert.equal(jobs.size, 0);
  queueDown = false;
  await post({ id: 1 });
  assert.equal(jobs.size, 1, "the saved-but-unqueued run is queued on redelivery");
});
