// Unit tests for Filter/Branch conditions (pure functions, no network).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { evaluateCondition } = require("../src/conditions");

// Context shaped like a real GitHub New Issue payload.
const ctx = { trigger: { issue: { number: 7, title: "Login broken on Safari", labels: "" }, repository: { full_name: "octo/demo" } }, steps: {} };
const check = (operator, path, value) => evaluateCondition(ctx, { path, operator, value });

test("operators saved by the builder (UPPERCASE) work", () => {
  assert.equal(check("EQUALS", "trigger.repository.full_name", "octo/demo"), true);
  assert.equal(check("NOT_EQUALS", "trigger.repository.full_name", "octo/demo"), false);
  assert.equal(check("CONTAINS", "trigger.issue.title", "Safari"), true);
  assert.equal(check("CONTAINS", "trigger.issue.title", "Chrome"), false);
});

test("lowercase operators keep working (existing Zaps / branch conditions)", () => {
  assert.equal(check("equals", "trigger.repository.full_name", "octo/demo"), true);
  assert.equal(check("contains", "trigger.issue.title", "Login"), true);
});

test("values typed in the builder are text but still compare with numbers", () => {
  assert.equal(check("EQUALS", "trigger.issue.number", "7"), true);
  assert.equal(check("GREATER_THAN", "trigger.issue.number", "5"), true);
  assert.equal(check("LESS_THAN", "trigger.issue.number", "5"), false);
  assert.equal(check("GREATER_THAN", "trigger.issue.title", "5"), false, "non-numeric never passes a numeric comparison");
});

test("EXISTS passes only for present, non-empty values", () => {
  assert.equal(check("EXISTS", "trigger.issue.title", ""), true);
  assert.equal(check("EXISTS", "trigger.issue.labels", ""), false);
  assert.equal(check("EXISTS", "trigger.issue.missing", ""), false);
});

test("a missing field fails EQUALS/CONTAINS cleanly instead of throwing", () => {
  assert.equal(check("EQUALS", "trigger.issue.missing", "x"), false);
  assert.equal(check("CONTAINS", "trigger.issue.missing", "x"), false);
  assert.equal(check("NOT_EQUALS", "trigger.issue.missing", "x"), true);
});

test("an unknown operator is still reported", () => {
  assert.throws(() => check("BETWEEN", "trigger.issue.number", "1"), /Unknown condition operator/);
});
