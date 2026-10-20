// Builder "Test step" for a Filter (no network; Prisma stubbed).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.JWT_SECRET = "test-secret";
const prismaPath = require.resolve(path.join(__dirname, "../src/prismaClient"));
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {} };

const handler = require("../src/routes/testStep").stack.find((l) => l.route?.path === "/" && l.route.methods.post).route.stack.at(-1).handle;

async function run(step, trigger) {
  let body;
  await handler({ body: { step, sampleContext: { trigger, steps: {} } }, userId: "u1" }, { json: (b) => { body = b; }, status() { return this; } });
  return body;
}
const trigger = { issue: { title: "Login broken on Safari", number: 7 } };

test("filter as stored by the builder panel (flat config) can be tested", async () => {
  const out = await run({ type: "FILTER", config: { path: "trigger.issue.title", operator: "CONTAINS", value: "Safari" } }, trigger);
  assert.deepEqual(out, { status: "SUCCESS", output: { passed: true }, error: null });
});

test("filter as published ({ condition }) still works", async () => {
  const out = await run({ type: "FILTER", config: { condition: { path: "trigger.issue.number", operator: "GREATER_THAN", value: "10" } } }, trigger);
  assert.deepEqual(out.output, { passed: false });
});
