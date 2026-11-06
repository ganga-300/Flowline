// Server-side trigger validation (POST /zaps, PUT /zaps/:id): only the builder's triggers
// are accepted, so the API can't make the worker poll arbitrary (internal) URLs.
// MOCKED: Prisma is a small in-memory fake; no database or network.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { validateTrigger } = require("../src/lib/triggerValidation");

process.env.JWT_SECRET = "test-secret";
function stub(file, exports) {
  const resolved = require.resolve(file);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// ── Valid configurations (exactly what the builder sends) ──
const webhook = () => ({ type: "WEBHOOK", config: { provider: "webhook", event: "catch_hook" } });
const github = (config = {}) => ({ type: "POLLING", connectionId: "c_gh", pollIntervalSec: 300, config: { provider: "github", event: "new_issue", repo: "octo/hello-world", connectionId: "c_gh", ...config } });
const gmail = (config = {}) => ({ type: "POLLING", connectionId: "c_gm", pollIntervalSec: 300, config: { provider: "gmail", event: "new_email", query: "subject:flowline-test", connectionId: "c_gm", ...config } });
const slack = (config = {}) => ({ type: "POLLING", connectionId: "c_sl", pollIntervalSec: 300, config: { provider: "slack", event: "new_message", channel: "C0123ABC", connectionId: "c_sl", ...config } });

test("accepts every trigger the builder can produce", () => {
  const valid = [
    webhook(),
    { type: "WEBHOOK", config: {} }, // API-created webhook without provider/event
    { type: "WEBHOOK" },
    github(),
    github({ event: "new_push" }),
    github({ repo: "https://github.com/octo/hello.world" }),
    github({ repo: undefined, repository: "my-org/my_repo" }),
    gmail(),
    gmail({ query: "" }),
    gmail({ repo: "octo/hello-world" }), // leftover field after switching apps in the builder
    slack(),
    slack({ channel: "#general", channelName: "general" }),
    { ...webhook(), config: { ...webhook().config, repo: "o/r", connectionId: null } },
  ];
  for (const t of valid) assert.equal(validateTrigger(t), null, JSON.stringify(t));
});

test("rejects the generic HTTP poller and unknown settings", () => {
  const bad = [
    { type: "POLLING", config: { url: "http://169.254.169.254/latest/meta-data/" } },
    { type: "POLLING", config: { provider: "http", url: "http://127.0.0.1:6379/" } },
    github({ url: "http://localhost/" }),
    gmail({ headers: { Host: "internal" } }),
    slack({ webhookUrl: "http://10.0.0.1/" }),
    { type: "WEBHOOK", config: { url: "http://127.0.0.1/" } },
  ];
  for (const t of bad) assert.match(validateTrigger(t), /not a supported setting|provider/, JSON.stringify(t));
});

test("rejects invalid trigger types, providers and events", () => {
  assert.match(validateTrigger(null), /must be an object/);
  assert.match(validateTrigger([]), /must be an object/);
  assert.match(validateTrigger({ type: "CRON", config: {} }), /trigger.type/);
  assert.match(validateTrigger({ type: "POLLING", config: {} }), /provider/);
  assert.match(validateTrigger({ type: "POLLING", config: { provider: "webhook", event: "catch_hook" } }), /must have type "WEBHOOK"/);
  assert.match(validateTrigger({ type: "WEBHOOK", config: { provider: "github", event: "new_issue", repo: "o/r" } }), /must have type "POLLING"/);
  assert.match(validateTrigger({ type: "POLLING", config: { provider: "dropbox" } }), /provider/);
  assert.match(validateTrigger({ type: "POLLING", config: { provider: "__proto__" } }), /provider/);
  assert.match(validateTrigger(github({ event: "new_star" })), /event must be one of/);
  assert.match(validateTrigger(github({ event: undefined })), /event must be one of/);
  assert.match(validateTrigger({ type: "WEBHOOK", config: { provider: "webhook", event: "other" } }), /event must be one of/);
  assert.match(validateTrigger({ type: "POLLING", config: "provider=github" }), /config must be an object/);
});

test("rejects malformed field values", () => {
  assert.match(validateTrigger(github({ repo: undefined })), /GitHub repository/);
  assert.match(validateTrigger(github({ repo: "../../user" })), /owner\/name/);
  assert.match(validateTrigger(github({ repo: "../x" })), /owner\/name/);
  assert.match(validateTrigger(github({ repo: "octo/hello?x=1" })), /owner\/name/);
  assert.match(validateTrigger(github({ repo: "octo" })), /owner\/name/);
  assert.match(validateTrigger(github({ repo: { $ne: "" } })), /must be text/);
  assert.match(validateTrigger(slack({ channel: undefined })), /Slack channel/);
  assert.match(validateTrigger(slack({ channel: "C1&token=x" })), /channel ID or #name/);
  assert.match(validateTrigger(gmail({ query: "x".repeat(501) })), /too long/);
  assert.match(validateTrigger({ ...github(), connectionId: 42 }), /connectionId must be text/);
  assert.match(validateTrigger({ ...github(), pollIntervalSec: -5 }), /pollIntervalSec/);
  assert.match(validateTrigger({ ...github(), pollIntervalSec: "300" }), /pollIntervalSec/);
});

// ── Route level: invalid triggers are rejected before anything is saved ──
let created;
const forbidden = () => { throw new Error("must not touch the database for an invalid trigger"); };
const prisma = {
  connection: { count: async ({ where }) => where.id.in.length },
  zap: {
    create: async ({ data }) => { created.push(data); return { id: "z_new", ...data }; },
    findFirst: forbidden,
  },
  trigger: { update: forbidden, create: forbidden },
  step: { deleteMany: forbidden, update: forbidden, create: forbidden },
  // Valid Zaps are created in a transaction: the Zap, then its steps.
  $transaction: async (fn) => fn({
    zap: { create: (args) => prisma.zap.create(args), findFirst: async () => ({ id: "z_new" }) },
    step: { create: async ({ data }) => ({ id: "s_new", ...data }) },
  }),
};
stub(path.join(__dirname, "../src/prismaClient.js"), prisma);
stub(path.join(__dirname, "../src/Queue.js"), { zapExecutionQueue: { add: async () => {} } });

const router = require("../src/routes/zaps");
const handlerFor = (method, routePath) =>
  router.stack.find((l) => l.route?.path === routePath && l.route.methods[method]).route.stack.at(-1).handle;
async function call(method, routePath, body, params = {}) {
  const out = { status: 200 };
  await handlerFor(method, routePath)(
    { userId: "alice", params, body, query: {} },
    { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } }
  );
  return out;
}

beforeEach(() => { created = []; });

test("POST /zaps rejects a polling trigger with an internal URL and saves nothing", async () => {
  const out = await call("post", "/", { name: "ssrf", trigger: { type: "POLLING", config: { url: "http://169.254.169.254/" } }, steps: [] });
  assert.equal(out.status, 400);
  assert.match(out.body.error, /not a supported setting/);
  assert.equal(created.length, 0);
});

test("POST /zaps rejects an unsupported trigger type", async () => {
  const out = await call("post", "/", { name: "x", trigger: { type: "CRON", config: {} }, steps: [] });
  assert.equal(out.status, 400);
  assert.equal(created.length, 0);
});

test("POST /zaps still creates valid Gmail, Slack, GitHub and webhook Zaps", async () => {
  for (const trigger of [webhook(), github(), gmail(), slack()]) {
    const out = await call("post", "/", { name: "ok", trigger, steps: [] });
    assert.equal(out.status, 201, JSON.stringify(out.body));
  }
  assert.equal(created.length, 4);
});

test("PUT /zaps/:id rejects switching a Zap to a generic URL poller before touching the database", async () => {
  const out = await call("put", "/:id", { name: "x", trigger: { type: "POLLING", config: { provider: "github", event: "new_issue", repo: "o/r", url: "http://127.0.0.1/" } }, steps: [] }, { id: "z1" });
  assert.equal(out.status, 400);
  assert.match(out.body.error, /trigger.config.url/);
});
