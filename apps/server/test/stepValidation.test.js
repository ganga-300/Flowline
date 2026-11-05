// A Delay must be a top-level step (POST /zaps and PUT /zaps/:id).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nestedDelayError } = require("../src/lib/stepValidation");

test("top-level Delays and nested non-Delay steps are allowed", () => {
  assert.equal(nestedDelayError([{ type: "DELAY" }, { type: "ACTION", parentStepId: "b" }]), null);
  assert.equal(nestedDelayError(undefined), null);
});

test("a Delay with a parent is rejected on create", () => {
  assert.match(nestedDelayError([{ type: "DELAY", parentStepId: "b" }]), /can't be inside a Branch or Loop/);
});

test("on edit the saved parent counts, not the one in the request", () => {
  const saved = [{ id: "s1", parentStepId: "b" }, { id: "s2", parentStepId: null }];
  assert.match(nestedDelayError([{ id: "s1", type: "DELAY" }], saved), /Branch or Loop/);
  assert.equal(nestedDelayError([{ id: "s2", type: "DELAY", parentStepId: "b" }], saved), null);
});
