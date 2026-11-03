/**
 * Server-side validation of a Zap's trigger (POST /zaps, PUT /zaps/:id).
 * Only the triggers the builder offers are accepted: Webhook (catch_hook), GitHub
 * (new_issue, new_push), Gmail (new_email) and Slack (new_message). Anything else - in
 * particular a POLLING trigger with a `url` (the removed generic HTTP poller) - is
 * rejected, so the API can't be used to make the worker fetch arbitrary addresses.
 */

const PROVIDERS = {
  webhook: { type: "WEBHOOK", events: ["catch_hook"] },
  github: { type: "POLLING", events: ["new_issue", "new_push"] },
  gmail: { type: "POLLING", events: ["new_email"] },
  slack: { type: "POLLING", events: ["new_message"] },
};

// Every config key the builder writes. Switching apps in the builder keeps the previous
// app's fields (e.g. `repo` on a Gmail trigger), so the list is shared by all providers.
const ALLOWED_CONFIG_KEYS = new Set([
  "provider", "event", "connectionId",
  "repo", "repository", // GitHub
  "query", "q", // Gmail
  "channel", "channelId", "channelName", // Slack
]);

const MAX_FIELD_LENGTH = 500;
const MAX_POLL_INTERVAL_SEC = 86400;
// owner/name; GitHub names use letters, digits, "-", "_" and "." (but are never "." or "..").
const REPO_PATTERN = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;
// A Slack channel id (C0123...) or name (#general).
const SLACK_CHANNEL_PATTERN = /^#?[A-Za-z0-9._-]{1,80}$/;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Same cleanup the poller applies (pollingCron.js) before calling the GitHub API. */
function cleanRepo(repo) {
  return repo.trim().replace(/^https?:\/\/github\.com\//i, "");
}

/** Returns a user-facing error message, or null if the trigger is valid. */
function validateTrigger(trigger) {
  if (!isPlainObject(trigger)) return "trigger must be an object";
  if (trigger.type !== "WEBHOOK" && trigger.type !== "POLLING") {
    return 'trigger.type must be "WEBHOOK" or "POLLING"';
  }
  if (trigger.config !== undefined && trigger.config !== null && !isPlainObject(trigger.config)) {
    return "trigger.config must be an object";
  }
  const config = trigger.config || {};

  for (const [key, value] of Object.entries(config)) {
    if (!ALLOWED_CONFIG_KEYS.has(key)) return `trigger.config.${key} is not a supported setting`;
    if (value === null || value === undefined) continue;
    if (typeof value !== "string") return `trigger.config.${key} must be text`;
    if (value.length > MAX_FIELD_LENGTH) return `trigger.config.${key} is too long`;
  }
  if (trigger.connectionId !== undefined && trigger.connectionId !== null && typeof trigger.connectionId !== "string") {
    return "trigger.connectionId must be text";
  }
  if (trigger.pollIntervalSec !== undefined && trigger.pollIntervalSec !== null) {
    const n = trigger.pollIntervalSec;
    if (!Number.isInteger(n) || n < 1 || n > MAX_POLL_INTERVAL_SEC) {
      return `trigger.pollIntervalSec must be a whole number of seconds (1-${MAX_POLL_INTERVAL_SEC})`;
    }
  }

  // API-created webhook triggers may omit provider/event.
  const providerId = config.provider || (trigger.type === "WEBHOOK" ? "webhook" : null);
  const provider = providerId && Object.hasOwn(PROVIDERS, providerId) ? PROVIDERS[providerId] : null;
  if (!provider) {
    return trigger.type === "POLLING"
      ? 'A polling trigger needs trigger.config.provider set to "github", "gmail" or "slack"'
      : `Unsupported trigger app "${providerId}"`;
  }
  if (provider.type !== trigger.type) {
    return `A ${providerId} trigger must have type "${provider.type}"`;
  }
  if (config.event || trigger.type === "POLLING") {
    if (!provider.events.includes(config.event)) {
      return `trigger.config.event must be one of: ${provider.events.join(", ")}`;
    }
  }

  if (providerId === "github") {
    const repo = config.repo || config.repository;
    if (!repo) return "Please select a GitHub repository in the trigger step.";
    const match = cleanRepo(repo).match(REPO_PATTERN);
    if (!match || [match[1], match[2]].some((part) => part === "." || part === "..")) {
      return 'GitHub repository must look like "owner/name"';
    }
  }
  if (providerId === "slack") {
    const channel = config.channel || config.channelId;
    if (!channel) return "Please select a Slack channel in the trigger step.";
    if (!SLACK_CHANNEL_PATTERN.test(channel)) return "Slack channel must be a channel ID or #name";
  }

  return null;
}

module.exports = { validateTrigger, ALLOWED_CONFIG_KEYS };
