// Checks run before publishing a Zap. Returns a user-facing error message, or null if OK.
// Kept free of React so it can be unit-tested.

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

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.type !== "ACTION") continue;
    if (!s.config?.provider && !s.config?.url) return `Step ${i + 1} is incomplete. Please select an app to continue.`;
    const name = OAUTH_PROVIDERS[s.config?.provider];
    if (name) {
      if (!s.config.action) return `Step ${i + 1}: please choose a ${name} action.`;
      if (!connectionOf(s)) return `Step ${i + 1}: please choose a ${name} account.`;
    }
  }
  return null;
}
