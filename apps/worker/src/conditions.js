// Resolves a dot-path like "trigger.message" or "steps.step_5.output.score"
// against the run context. Splits the path into segments and walks the
// context object one segment at a time. Returns undefined if any segment
// is missing along the way, instead of throwing - a missing field should
// fail the condition cleanly, not crash the whole run.
function resolvePath(context, path) {
  const segments = path.split(".");
  return segments.reduce((current, segment) => {
    if (current == null) return undefined;
    return current[segment];
  }, context);
}

// Evaluates a single condition object against the run context.
// condition shape: { path: "trigger.message", operator: "equals", value: "hello" }
function evaluateCondition(context, condition) {
  const actual = resolvePath(context, condition.path);

  switch (condition.operator) {
    case "equals":
      return actual === condition.value;
    case "not_equals":
      return actual !== condition.value;
    case "contains":
      return typeof actual === "string" && actual.includes(condition.value);
    case "greater_than":
      return typeof actual === "number" && actual > condition.value;
    case "less_than":
      return typeof actual === "number" && actual < condition.value;
    default:
      throw new Error(`Unknown condition operator: ${condition.operator}`);
  }
}

module.exports = { resolvePath, evaluateCondition };