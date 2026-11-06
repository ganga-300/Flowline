// Saving nested steps (Paths, Loop bodies): parent links by ref, parents saved first.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { planStepTree, saveStepTree } = require("../src/lib/stepTree");

const step = (ref, extra = {}) => ({ type: "ACTION", name: ref, order: 0, config: { ref }, ...extra });

test("orders parents before children whatever order they arrive in", () => {
  const { ordered, error } = planStepTree([step("c", { parentRef: "b" }), step("b", { parentRef: "a" }), step("a")]);
  assert.equal(error, undefined);
  assert.deepEqual(ordered.map((s) => s.config.ref), ["a", "b", "c"]);
});

test("rejects unknown parents, duplicate refs, cycles and bad conditions", () => {
  assert.match(planStepTree([step("a", { parentRef: "x" })]).error, /isn't in this Zap/);
  assert.match(planStepTree([step("a"), step("a")]).error, /same ref/);
  assert.match(planStepTree([step("a", { parentRef: "b" }), step("b", { parentRef: "a" })]).error, /inside themselves/);
  assert.match(planStepTree([step("a", { branchCondition: "yes" })]).error, /condition must be an object/);
  assert.deepEqual(planStepTree(undefined), { ordered: [] });
});

test("creates new steps, updates known ones, and links children to their parent's id", async () => {
  const calls = [];
  const tx = {
    step: {
      create: async ({ data }) => { calls.push(["create", data]); return { id: `new_${data.config.ref}` }; },
      update: async ({ where, data }) => { calls.push(["update", where.id, data]); },
    },
  };
  const { ordered } = planStepTree([
    step("loop", { id: "s_loop", type: "LOOP" }),
    step("body", { parentRef: "loop", order: 0 }),
  ]);
  const ids = await saveStepTree(tx, "z1", ordered, new Set(["s_loop"]));
  assert.deepEqual(ids, ["s_loop", "new_body"]);
  assert.equal(calls[0][0], "update");
  assert.equal(calls[0][2].parentStepId, null);
  assert.equal(calls[1][1].zapId, "z1");
  assert.equal(calls[1][1].parentStepId, "s_loop");
});
