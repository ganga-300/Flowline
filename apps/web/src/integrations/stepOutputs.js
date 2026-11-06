/**
 * Output fields each action step produces, as returned by the worker handlers in
 * apps/worker/src/integrations/<provider>/*.js (a contract test checks they match).
 * Later steps reference them as {{steps.<ref>.output.<key>}}, where <ref> is the
 * builder step id saved into the step's config as `ref` when the Zap is published.
 */
export const ACTION_OUTPUTS = {
  "github:create_issue": [
    { key: "issueNumber", label: "Issue #", example: "12" },
    { key: "issueUrl", label: "Issue URL", example: "https://github.com/your-org/your-repo/issues/12" },
    { key: "title", label: "Issue Title", example: "New issue example" },
    { key: "repository", label: "Repository", example: "your-org/your-repo" },
    { key: "status", label: "Status", example: "CREATED" },
  ],
  "github:add_comment": [
    { key: "commentId", label: "Comment ID", example: "99" },
    { key: "commentUrl", label: "Comment URL", example: "https://github.com/your-org/your-repo/issues/12#issuecomment-99" },
    { key: "issueNumber", label: "Issue #", example: "12" },
    { key: "repository", label: "Repository", example: "your-org/your-repo" },
    { key: "status", label: "Status", example: "COMMENTED" },
  ],
  "slack:send_message": [
    { key: "messageId", label: "Message Timestamp", example: "1729400000.000200" },
    { key: "channel", label: "Channel", example: "C012EXAMPLE" },
    { key: "status", label: "Status", example: "SENT" },
  ],
  "slack:send_dm": [
    { key: "messageId", label: "Message Timestamp", example: "1729400000.000300" },
    { key: "channelId", label: "DM Channel", example: "D012EXAMPLE" },
    { key: "recipient", label: "Recipient", example: "U012EXAMPLE" },
    { key: "status", label: "Status", example: "SENT" },
  ],
  "gmail:send_email": [
    { key: "messageId", label: "Message ID", example: "18f0c0ffee" },
    { key: "threadId", label: "Thread ID", example: "18f0c0ffee" },
    { key: "to", label: "Sent To", example: "recipient@example.com" },
    { key: "subject", label: "Subject", example: "Meeting Reminder" },
    { key: "status", label: "Status", example: "SENT" },
  ],
  "formatter:capitalize_text": [
    { key: "result", label: "Formatted Text", example: "Hello World" },
    { key: "originalText", label: "Original Text", example: "hello world" },
  ],
  "formatter:format_date": [
    { key: "formattedDate", label: "Formatted Date", example: "Jan 2, 2026" },
    { key: "isoString", label: "ISO Date", example: "2026-01-02T00:00:00.000Z" },
    { key: "timestamp", label: "Timestamp (ms)", example: "1767312000000" },
  ],
  "formatter:extract_regex": [
    { key: "matched", label: "Matched Text", example: "BUG-42" },
    { key: "found", label: "Found", example: "true" },
  ],
  "math:calculate": [
    { key: "result", label: "Result", example: "42" },
  ],
};

export function getStepOutputs(step) {
  const provider = step?.config?.provider;
  const action = step?.config?.action;
  if (provider && action) return ACTION_OUTPUTS[`${provider}:${action}`] || [];
  if (step?.type === "AI") return [{ key: "content", label: "AI Response", example: "Summary text" }];
  if (step?.type === "ACTION" && !provider && step?.config?.url) return [{ key: "status", label: "HTTP status", example: "200" }];
  if (step?.type === "LOOP") return [{ key: "iteratedCount", label: "Items processed", example: "3" }];
  return [];
}

/**
 * The current item's fields, for steps inside a Loop: {{loopItem}} / {{loopItem.<field>}} and
 * {{loopIndex}}. sample is one item of the list (from the trigger sample), if known.
 */
export function getLoopItemVariables(sample) {
  const vars = [];
  const add = (path, value) => vars.push({ label: path === "loopItem" ? "Current item" : path.replace(/^loopItem\./, ""), path, token: `{{${path}}}`, value });
  const walk = (value, path) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, v] of Object.entries(value)) walk(v, `${path}.${key}`);
    } else {
      add(path, value === undefined ? "" : String(value));
    }
  };
  if (sample && typeof sample === "object" && !Array.isArray(sample)) walk(sample, "loopItem");
  else add("loopItem", sample === undefined ? "" : String(sample));
  vars.push({ label: "Item number (from 0)", path: "loopIndex", token: "{{loopIndex}}", value: "0" });
  return vars;
}

/**
 * Variables a later step can insert from this step, e.g. {{steps.step-1.output.issueUrl}}.
 * The Loop a step is inside (marked isCurrentLoop by the builder) offers the current item.
 */
export function getStepOutputVariables(step) {
  if (step?.type === "LOOP" && step.isCurrentLoop) return getLoopItemVariables(step.loopSample);
  return getStepOutputs(step).map((o) => ({
    label: o.label,
    path: `steps.${step.id}.output.${o.key}`,
    token: `{{steps.${step.id}.output.${o.key}}}`,
    value: o.example,
  }));
}

/** Example outputs for earlier steps, used as context when testing a step in the builder. */
export function buildSampleStepContext(previousSteps = []) {
  const steps = {};
  for (const step of previousSteps) {
    const outputs = getStepOutputs(step);
    if (outputs.length === 0) continue;
    steps[step.id] = { output: Object.fromEntries(outputs.map((o) => [o.key, o.example])) };
  }
  return steps;
}

/** Steps that run before `stepId` in the builder (only these have outputs available). */
export function getPreviousSteps(steps = [], stepId) {
  const index = steps.findIndex((s) => s.id === stepId);
  return index === -1 ? steps : steps.slice(0, index);
}
