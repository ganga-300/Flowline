// The builder's step tree (Paths, Loop): edits, run order, and the API round trip.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROOT, allowedKinds, canMove, duplicateStep, findStep, flattenSteps, fromSavedSteps, insertStep, moveStep,
  removeStep, stepNumbers, stepsBefore, toPayloadSteps, treeProblem, updateStep,
} from "../src/lib/stepTree.js";
import { toZapPayload, fromSavedZap } from "../src/lib/zapForm.js";

const action = (id, extra = {}) => ({ id, type: "ACTION", name: id, config: { url: `https://${id}.test` }, isConfigured: true, ...extra });

// trigger -> a -> Paths(VIP: [v1, v2] | Otherwise: [o1]) -> Loop(items: [l1]) -> z
const tree = () => [
  action("a"),
  {
    id: "p", type: "BRANCH", name: "Route", config: {}, isConfigured: true,
    paths: [
      { id: "pa", name: "VIP", condition: { path: "trigger.vip", operator: "EQUALS", value: "yes" }, steps: [action("v1"), action("v2")] },
      { id: "pe", name: "Otherwise", condition: null, steps: [action("o1")] },
    ],
  },
  { id: "l", type: "LOOP", name: "Each", config: { arrayPath: "trigger.items" }, isConfigured: true, steps: [action("l1")] },
  action("z"),
];

test("run order, numbering and lookup reach nested steps", () => {
  assert.deepEqual(flattenSteps(tree()).map((s) => s.id), ["a", "p", "v1", "v2", "o1", "l", "l1", "z"]);
  const n = stepNumbers(tree());
  assert.equal(n.get("a"), 2, "the trigger is 1");
  assert.equal(n.get("v2"), 5);
  const found = findStep(tree(), "l1");
  assert.deepEqual(found.where, { kind: "loop", stepId: "l" });
  assert.equal(found.inLoop, true);
});

test("insert, update, move and remove work at any depth", () => {
  let t = insertStep(tree(), { kind: "path", stepId: "p", pathId: "pe" }, 0, action("o0"));
  assert.deepEqual(t[1].paths[1].steps.map((s) => s.id), ["o0", "o1"]);
  t = updateStep(t, "v2", (s) => ({ ...s, name: "Renamed" }));
  assert.equal(findStep(t, "v2").step.name, "Renamed");
  assert.equal(canMove(t, "v2", 1), false, "last in its path");
  t = moveStep(t, "v2", -1);
  assert.deepEqual(t[1].paths[0].steps.map((s) => s.id), ["v2", "v1"]);
  t = removeStep(t, "l1");
  assert.deepEqual(t[2].steps, []);
  assert.equal(tree()[2].steps.length, 1, "the original tree is not mutated");
});

test("duplicate copies a container with new ids, right after the original", () => {
  let n = 0;
  const { steps, copy } = duplicateStep(tree(), "p", () => `new${++n}`);
  assert.equal(steps[2].id, copy.id);
  assert.equal(copy.name, "Route (copy)");
  const ids = flattenSteps([copy]).map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith("new")));
  assert.equal(copy.dbId, undefined);
});

test("steps before a step: earlier siblings and the containers it is in, not other paths", () => {
  assert.deepEqual(stepsBefore(tree(), "o1").map((s) => s.id), ["a", "p"]);
  assert.deepEqual(stepsBefore(tree(), "v2").map((s) => s.id), ["a", "p", "v1"]);
  assert.deepEqual(stepsBefore(tree(), "l1").map((s) => s.id), ["a", "p", "l"]);
  assert.deepEqual(stepsBefore(tree(), "z").map((s) => s.id), ["a", "p", "l"]);
});

test("where new steps may go: no nested Delay, a path can't start with Paths or a Loop", () => {
  const inPathStart = allowedKinds({ kind: "path", stepId: "p", pathId: "pa" }, 0);
  assert.equal(inPathStart("ACTION"), true);
  assert.equal(inPathStart("BRANCH"), false);
  assert.equal(inPathStart("DELAY"), false);
  assert.equal(allowedKinds({ kind: "path", stepId: "p", pathId: "pa" }, 1)("LOOP"), true);
  assert.equal(allowedKinds(ROOT, 0)("DELAY"), true);
});

test("problems are reported in plain words", () => {
  const label = (s) => s.id;
  assert.equal(treeProblem(tree(), label), null);
  const emptyPath = updateStep(tree(), "p", (s) => ({ ...s, paths: [s.paths[0], { ...s.paths[1], steps: [] }] }));
  assert.match(treeProblem(emptyPath, label), /p: "Otherwise" needs at least one step/);
  const noRule = updateStep(tree(), "p", (s) => ({ ...s, paths: [{ ...s.paths[0], condition: { path: "", operator: "EQUALS", value: "" } }, s.paths[1]] }));
  assert.match(treeProblem(noRule, label), /"VIP" needs a rule/);
  const noList = updateStep(tree(), "l", (s) => ({ ...s, config: { arrayPath: "" } }));
  assert.match(treeProblem(noList, label), /choose the list of items/);
  const nestedDelay = insertStep(tree(), { kind: "loop", stepId: "l" }, 1, { id: "d", type: "DELAY", config: { seconds: 5 } });
  assert.match(treeProblem(nestedDelay, label), /a Delay can't be inside/);
});

test("payload: a path's first step carries its rule and is the parent of the rest", () => {
  const rows = toPayloadSteps(tree()).map((r) => ({ id: r.step.id, parentRef: r.parentRef, order: r.order, rule: r.branchCondition }));
  assert.deepEqual(rows, [
    { id: "a", parentRef: null, order: 0, rule: undefined },
    { id: "p", parentRef: null, order: 1, rule: undefined },
    { id: "v1", parentRef: "p", order: 0, rule: { path: "trigger.vip", operator: "EQUALS", value: "yes", name: "VIP" } },
    { id: "v2", parentRef: "v1", order: 0, rule: undefined },
    { id: "o1", parentRef: "p", order: 1, rule: null },
    { id: "l", parentRef: null, order: 2, rule: undefined },
    { id: "l1", parentRef: "l", order: 0, rule: undefined },
    { id: "z", parentRef: null, order: 3, rule: undefined },
  ]);
});

// What POST /zaps stores and GET /zaps/:id returns: parentRef resolved to the parent's id.
function simulateSave(payload) {
  const idByRef = Object.fromEntries(payload.steps.map((s, i) => [s.config.ref, `db_${i}`]));
  return {
    id: "z1", zapName: payload.name,
    trigger: { id: "t1", type: payload.trigger.type, config: payload.trigger.config },
    steps: payload.steps.map(({ parentRef, ...s }, i) => ({
      id: `db_${i}`, connectionId: null, branchCondition: s.branchCondition ?? null, ...s,
      parentStepId: parentRef ? idByRef[parentRef] : null,
    })),
  };
}

test("Paths and Loop survive save -> load -> save unchanged", () => {
  const state = { zapName: "Tree", trigger: { type: "WEBHOOK", config: { provider: "webhook", event: "catch_hook" }, isConfigured: true }, steps: tree() };
  const first = toZapPayload(state);
  const loaded = fromSavedZap(simulateSave(first));
  assert.deepEqual(flattenSteps(loaded.steps).map((s) => s.id), ["a", "p", "v1", "v2", "o1", "l", "l1", "z"]);
  const paths = loaded.steps[1].paths;
  assert.deepEqual(paths.map((p) => [p.name, p.condition?.path ?? null]), [["VIP", "trigger.vip"], ["Otherwise", null]]);
  assert.equal(loaded.steps[2].config.arrayPath, "trigger.items");
  const again = toZapPayload(loaded);
  assert.deepEqual(again.steps.map(({ id, ...s }) => s), first.steps, "same tree, refs and rules");
  assert.ok(again.steps.every((s) => s.id), "steps are updated in place (database ids sent)");
});

test("steps chained under a plain step (made via the API) load as following siblings", () => {
  const saved = [
    { id: "s1", type: "ACTION", order: 0, parentStepId: null, config: { ref: "x" } },
    { id: "s2", type: "ACTION", order: 0, parentStepId: "s1", config: { ref: "y" } },
  ];
  const steps = fromSavedSteps(saved, (s) => ({ id: s.config.ref, type: s.type }));
  assert.deepEqual(steps.map((s) => s.id), ["x", "y"]);
});
