// Step-to-step data passing.
// MOCKED: GitHub/Slack/Gmail APIs (global.fetch) and Prisma. Proves that outputs the
// builder offers ({{steps.<ref>.output.<key>}}) exist on the real handlers' results and
// resolve in a later step - NOT that the providers accept the requests.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const prismaPath = require.resolve(path.join(__dirname, "../src/prismaClient"));
const conns = {
  c_gh: { id: "c_gh", provider: "github:octo", accessToken: "gh-fake" },
  c_sl: { id: "c_sl", provider: "slack:Acme", accessToken: "xoxb-fake" },
  c_gm: { id: "c_gm", provider: "gmail:me@example.com", accessToken: "ya29-fake" },
};
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {
  connection: { findUnique: async ({ where }) => conns[where.id] || null, update: async () => ({}) },
} };

let posted = [];
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : null;
  posted.push({ url: u, body });
  const json = (status, b) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.endsWith("/repos/octo/demo/issues")) return json(201, { number: 12, html_url: "https://github.com/octo/demo/issues/12", title: body.title });
  if (u.endsWith("/issues/12/comments")) return json(201, { id: 99, html_url: "https://github.com/octo/demo/issues/12#issuecomment-99" });
  if (u.includes("slack.com/api/conversations.open")) return json(200, { ok: true, channel: { id: "D1" } });
  if (u.includes("slack.com/api/chat.postMessage")) return json(200, { ok: true, ts: "1729.0001", channel: body.channel });
  if (u.includes("gmail.googleapis.com")) return json(200, { id: "m1", threadId: "t1" });
  throw new Error(`Unexpected fetch ${u}`);
};

const { getIntegrationHandler } = require("../src/integrations/registry");
const { recordStepOutput, restoreStepOutputs } = require("../src/stepContext");

let outputsModule;
test.before(async () => {
  outputsModule = await import(pathToFileURL(path.join(__dirname, "../../web/src/integrations/stepOutputs.js")).href);
});
beforeEach(() => { posted = []; });

const triggerContext = () => ({ trigger: { issue: { title: "Login broken", number: 7 } }, steps: {} });
const configs = {
  "github:create_issue": { repo: "octo/demo", title: "{{trigger.issue.title}}" },
  "github:add_comment": { repo: "octo/demo", issueNumber: "12", body: "hi" },
  "slack:send_message": { channel: "C1", text: "hi" },
  "slack:send_dm": { userId: "U1", text: "hi" },
  "gmail:send_email": { to: "a@example.com", subject: "s", body: "b" },
};
const connFor = { github: "c_gh", slack: "c_sl", gmail: "c_gm" };

test("every output field the builder offers exists on the real handler's output", async () => {
  for (const [key, declared] of Object.entries(outputsModule.ACTION_OUTPUTS)) {
    const [provider, action] = key.split(":");
    const handler = getIntegrationHandler(provider, action);
    assert.ok(handler, `no worker handler for ${key}`);
    const { output } = await handler({ id: "s", connectionId: connFor[provider], config: { provider, action, config: configs[key] } }, triggerContext());
    for (const { key: field } of declared) {
      assert.ok(output[field] !== undefined && output[field] !== "", `${key} output is missing "${field}"`);
    }
  }
});

test("a later step can use an earlier step's output via its builder ref", async () => {
  const context = triggerContext();
  const step1 = { id: "db_cuid_1", type: "ACTION", config: { provider: "github", action: "create_issue", ref: "step-1", config: configs["github:create_issue"] } };
  const step2 = { id: "db_cuid_2", type: "ACTION", connectionId: "c_sl", config: { provider: "slack", action: "send_message", ref: "step-2",
    config: { channel: "C1", text: "Created {{steps.step-1.output.issueUrl}} (#{{steps.step-1.output.issueNumber}}) for {{trigger.issue.title}}" } } };

  const r1 = await getIntegrationHandler("github", "create_issue")({ ...step1, connectionId: "c_gh" }, context);
  recordStepOutput(context, step1, r1.output);
  await getIntegrationHandler("slack", "send_message")(step2, context);

  const slackPost = posted.find((p) => p.url.includes("chat.postMessage"));
  assert.equal(slackPost.body.text, "Created https://github.com/octo/demo/issues/12 (#12) for Login broken");
});

test("outputs stay reachable by database id too (older Zaps without ref)", () => {
  const context = triggerContext();
  recordStepOutput(context, { id: "db_1", config: {} }, { issueUrl: "u" });
  assert.deepEqual(context.steps, { db_1: { output: { issueUrl: "u" } } });
});

test("resuming after a Delay restores outputs under both ids", () => {
  const context = triggerContext();
  const allSteps = [{ id: "db_1", config: { ref: "step-1" } }];
  restoreStepOutputs(context, [{ stepId: "db_1", output: { issueUrl: "u" } }], allSteps);
  assert.equal(context.steps["step-1"].output.issueUrl, "u");
  assert.equal(context.steps.db_1.output.issueUrl, "u");
});

test("builder test context gives earlier steps example outputs that resolve", () => {
  const { resolveTemplate } = require("../src/conditions");
  const steps = [{ id: "step-1", type: "ACTION", config: { provider: "github", action: "create_issue" } }];
  const context = { trigger: {}, steps: outputsModule.buildSampleStepContext(steps) };
  const [variable] = outputsModule.getStepOutputVariables(steps[0]).filter((v) => v.path.endsWith("issueUrl"));
  assert.equal(resolveTemplate(context, variable.token), "https://github.com/your-org/your-repo/issues/12");
});

test("only steps before the current one are offered", () => {
  const steps = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(outputsModule.getPreviousSteps(steps, "b").map((s) => s.id), ["a"]);
  assert.deepEqual(outputsModule.getPreviousSteps(steps, "a"), []);
});
