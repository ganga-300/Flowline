// Pollers must never advance the "last seen" marker past an item that has no run yet.
// We simulate a crash (DB failure) while creating the 2nd of 3 new runs.
// MOCKED: provider APIs (global.fetch), Prisma, Redis/BullMQ.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const workerSrc = path.join(__dirname, "../src");
function stubModule(request, exports) {
  const resolved = require.resolve(request, { paths: [workerSrc] });
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
const jobs = new Set();
stubModule("bullmq", { Queue: class { async add(n, d, o) { jobs.add(o?.jobId || `nojobid-${jobs.size}`); } } });
stubModule("ioredis", class {});

let marker, runs, failOnCreate;
stubModule(path.join(workerSrc, "prismaClient"), {
  trigger: { update: async ({ data }) => { if ("lastPollHash" in data) marker = data.lastPollHash; } },
  zapRun: {
    create: async ({ data }) => {
      if (failOnCreate && failOnCreate(data)) throw new Error("simulated crash");
      if (runs.some((r) => r.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error("dup"), { code: "P2002" });
      const r = { id: `run_${runs.length + 1}`, ...data }; runs.push(r); return r;
    },
    findUnique: async ({ where }) => runs.find((r) => r.idempotencyKey === where.idempotencyKey) || null,
  },
});

global.fetch = async (url) => {
  const u = String(url);
  const json = (b) => ({ ok: true, status: 200, json: async () => b });
  if (u.includes("conversations.history")) return json({ ok: true, messages: ["3", "2", "1", "0"].map((t) => ({ type: "message", text: t, user: "U1", ts: `100.${t}` })) });
  if (u.includes("users.info") || u.includes("conversations.info")) return json({ ok: false });
  throw new Error(`Unexpected fetch ${u}`);
};

const poller = require("../src/pollingCron");
const conn = { id: "c", accessToken: "t", refreshToken: null };
const cases = {
  // Gmail and GitHub pushes move their checkpoint only after the whole batch is queued:
  // see gmailPolling.test.js and githubPolling.test.js.
  "Slack new_message": { fn: "pollSlackTrigger", start: "100.0", config: { provider: "slack", channel: "C1" }, second: (d) => d.idempotencyKey.endsWith("100.2"), firstId: "100.1", lastId: "100.3" },
};

beforeEach(() => { runs = []; jobs.clear(); failOnCreate = null; });

for (const [name, c] of Object.entries(cases)) {
  test(`${name}: crash mid-batch keeps the marker at the last item that has a run; next poll recovers it`, async () => {
    marker = c.start;
    failOnCreate = c.second;
    const trigger = () => ({ id: "t1", zapId: "z1", connection: conn, lastPollHash: marker, config: c.config });
    await poller[c.fn](trigger()).catch(() => {});
    assert.equal(marker, c.firstId, "marker must not skip past the item whose run failed");
    assert.equal(runs.length, 1);

    failOnCreate = null; // "restart"
    await poller[c.fn](trigger());
    assert.equal(marker, c.lastId);
    assert.equal(runs.length, 3, "every new item has exactly one run");
    assert.equal(jobs.size, 3, "and exactly one job");
  });
}
