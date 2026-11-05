const NESTED_DELAY_ERROR = "A Delay step can't be inside a Branch or Loop yet. Move it to the main list of steps.";

/**
 * A Delay must be a top-level step: the worker can only pause a run between top-level
 * steps (a nested Delay would not wait). Returns a user-facing error message, or null.
 * existingSteps: the Zap's saved steps, for edits - PUT keeps each step's saved parent.
 */
function nestedDelayError(steps, existingSteps = []) {
  if (!Array.isArray(steps)) return null;
  const savedParent = new Map(existingSteps.map((s) => [s.id, s.parentStepId]));
  for (const step of steps) {
    if (step?.type !== "DELAY") continue;
    const parent = step.id && savedParent.has(step.id) ? savedParent.get(step.id) : step.parentStepId;
    if (parent) return NESTED_DELAY_ERROR;
  }
  return null;
}

module.exports = { nestedDelayError, NESTED_DELAY_ERROR };
