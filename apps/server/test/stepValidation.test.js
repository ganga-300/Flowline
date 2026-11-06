// A Delay must be a top-level step (POST /zaps and PUT /zaps/:id).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nestedDelayError } = require("../src/lib/stepValidation");

test("top-level Delays and nested non-Delay steps are allowed", () => {
  assert.equal(nestedDelayError([{ type: "DELAY" }, { type: "ACTION", parentRef: "b" }]), null);
  assert.equal(nestedDelayError(undefined), null);
});

test("a Delay with a parent is rejected (builder parentRef or API parentStepId)", () => {
  assert.match(nestedDelayError([{ type: "DELAY", parentRef: "step-2" }]), /can't be inside a Branch or Loop/);
  assert.match(nestedDelayError([{ type: "DELAY", parentStepId: "b" }]), /can't be inside a Branch or Loop/);
});
