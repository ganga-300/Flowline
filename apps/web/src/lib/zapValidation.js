// Checks run before publishing a Flow. Returns a user-facing error message, or null if OK.
// Kept free of React so it can be unit-tested.
// Uses the same rule as the canvas's "Ready" badge (missingSetup), so a Flow can only be
// published when every card says Ready.
import { missingSetup } from "../features/zap-builder/setupProgress.js";
import { flattenSteps, stepNumbers, treeProblem } from "./stepTree.js";

/**
 * getAction(provider, action) returns the action definition (fields[].required), so
 * required fields are checked too. Without it only the app, action and account are checked.
 */
export function validateZapForPublish({ trigger, steps = [] }, { getAction = () => null } = {}) {
  const triggerProblem = missingSetup({ isTrigger: true, draft: trigger, getAction });
  if (triggerProblem) return `Trigger: ${triggerProblem.message}`;

  // Steps are numbered in run order (the trigger is 1), including steps inside Paths and Loops.
  const numbers = stepNumbers(steps);
  const label = (s) => `Step ${numbers.get(s.id)}`; // same number as the card on the canvas
  for (const s of flattenSteps(steps)) {
    const problem = missingSetup({ draft: s, getAction });
    if (problem) return `${label(s)}: ${problem.message}`;
  }
  return treeProblem(steps, label);
}
