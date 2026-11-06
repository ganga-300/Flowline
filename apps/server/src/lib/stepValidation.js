const NESTED_DELAY_ERROR = "A Delay step can't be inside a Branch or Loop yet. Move it to the main list of steps.";

/**
 * A Delay must be a top-level step: the worker can only pause a run between top-level
 * steps (a nested Delay would not wait). Returns a user-facing error message, or null.
 * A step is nested when it names a parent: `parentRef` (builder) or `parentStepId` (API).
 */
function nestedDelayError(steps) {
  if (!Array.isArray(steps)) return null;
  for (const step of steps) {
    if (step?.type === "DELAY" && (step.parentRef || step.parentStepId)) return NESTED_DELAY_ERROR;
  }
  return null;
}

module.exports = { nestedDelayError, NESTED_DELAY_ERROR };
