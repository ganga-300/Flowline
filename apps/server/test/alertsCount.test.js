// GET /alerts/count - the badge on the Alerts nav item. MOCKED: Prisma.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.JWT_SECRET = "test-secret";
let countArgs;
const prismaPath = require.resolve(path.join(__dirname, "../src/prismaClient"));
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { alert: { count: async (args) => { countArgs = args; return 3; } } } };

const handler = require("../src/routes/alerts").stack.find((l) => l.route?.path === "/count").route.stack.at(-1).handle;

test("counts only the signed-in user's alerts", async () => {
  const out = {};
  await handler({ userId: "alice" }, { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } });
  assert.deepEqual(out.body, { count: 3 });
  assert.deepEqual(countArgs, { where: { userId: "alice" } });
});
