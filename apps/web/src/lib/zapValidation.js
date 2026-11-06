// Checks run before publishing a Zap. Returns a user-facing error message, or null if OK.
// Kept free of React so it can be unit-tested.
import { flattenSteps, stepNumbers, treeProblem } from "./stepTree.js";

const OAUTH_PROVIDERS = { github: "GitHub", gmail: "Gmail", slack: "Slack" };

const connectionOf = (item) => item?.connectionId || item?.config?.connectionId || null;

export function validateZapForPublish({ trigger, steps = [] }) {
  const provider = trigger?.config?.provider;
  if (OAUTH_PROVIDERS[provider]) {
    const name = OAUTH_PROVIDERS[provider];
    if (!connectionOf(trigger)) return `Please choose a ${name} account in the trigger step.`;
    if (provider === "github" && !trigger.config?.repo) return "Please select a GitHub repository in the trigger step.";
    if (provider === "slack" && !trigger.config?.channel) return "Please select a Slack channel in the trigger step.";
  }

  // Steps are numbered in run order (the trigger is 1), including steps inside Paths and Loops.
  const numbers = stepNumbers(steps);
  const label = (s) => `Step ${numbers.get(s.id)}`; // same number as the card on the canvas
  for (const s of flattenSteps(steps)) {
    if (s.type !== "ACTION") continue;
    if (!s.config?.provider && !s.config?.url) return `${label(s)} is incomplete. Please select an app to continue.`;
    const name = OAUTH_PROVIDERS[s.config?.provider];
    if (name) {
      if (!s.config.action) return `${label(s)}: please choose a ${name} action.`;
      if (!connectionOf(s)) return `${label(s)}: please choose a ${name} account.`;
    }
  }
  return treeProblem(steps, label);
}
