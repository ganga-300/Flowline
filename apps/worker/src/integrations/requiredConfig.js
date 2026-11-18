/**
 * What a step needs before it can run. Used by the API when a Zap is saved (so a half set-up
 * step can't be published) and by the worker before running a step (so one that slipped
 * through fails with a clear message instead of "succeeding" with empty values).
 * Mirrors the fields marked required in the web app's integration definitions.
 */

// provider:action -> [config key, label shown to the user]
const REQUIRED_FIELDS = {
  "gmail:send_email": [["to", "To"], ["subject", "Subject"], ["body", "Body"]],
  "slack:send_message": [["channel", "Channel"], ["text", "Message Text"]],
  "slack:send_dm": [["userId", "Slack User or Email"], ["text", "Message Text"]],
  "github:create_issue": [["repo", "Repository"], ["title", "Issue Title"]],
  "github:add_comment": [["repo", "Repository"], ["issueNumber", "Issue or PR Number"], ["body", "Comment Content"]],
  "formatter:capitalize_text": [["text", "Input Text"]],
  "formatter:format_date": [["dateString", "Input Date"]],
  "formatter:extract_regex": [["text", "Input Text"], ["pattern", "Regex Pattern"]],
  "math:calculate": [["valueA", "First Number"], ["valueB", "Second Number / Precision"]],
};

const filled = (v) => v !== undefined && v !== null && String(v).trim() !== "";

function listOf(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Returns a user-facing message saying what's missing from the step, or null if it's
 * set up. Works on the step shape the API saves ({ type, config }).
 */
function missingStepConfig(step) {
  const config = step?.config || {};
  switch (step?.type) {
    case "ACTION": {
      if (config.provider) {
        if (!filled(config.action)) return "choose an action.";
        const required = REQUIRED_FIELDS[`${config.provider}:${config.action}`];
        if (!required) return `"${config.provider}" has no action "${config.action}".`;
        // Same lookup as the handlers: fields nested under config.config (builder) or flat
        // on config (Zaps created through the API).
        const values = config.config || config;
        const missing = required.filter(([key]) => !filled(values[key])).map(([, label]) => label);
        return missing.length ? `fill in ${listOf(missing)}.` : null;
      }
      // An HTTP request: no provider, a url.
      return filled(config.url) ? null : "enter the URL to send the request to.";
    }
    case "FILTER":
      return filled(config.condition?.path ?? config.path) ? null : "choose the field this filter checks.";
    case "AI":
      return filled(config.prompt ?? config.promptTemplate) ? null : "write the prompt.";
    case "DELAY":
      return Number(config.seconds) > 0 ? null : "set how long to wait.";
    case "LOOP":
      return filled(config.arrayPath) ? null : "choose the list to loop over.";
    default:
      return null;
  }
}

module.exports = { missingStepConfig, REQUIRED_FIELDS };
