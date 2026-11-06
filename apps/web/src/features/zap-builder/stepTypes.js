// Pure builder helpers: step kinds, new-step defaults and the one-line card summaries.
// App lookups are passed in (registry) so this file stays testable without the
// integration modules.
import { triggerProviders } from "../../integrations/triggers.js";

/** Kinds offered in the "add a step" menu, in display order. */
export const STEP_KINDS = [
  { type: "ACTION", label: "App action", description: "Do something in GitHub, Slack or Gmail, or format and calculate data" },
  { type: "FILTER", label: "Filter", description: "Only continue when a condition is true" },
  { type: "DELAY", label: "Delay", description: "Wait before the next step" },
  { type: "AI", label: "AI prompt", description: "Send a prompt built from earlier data" },
  { type: "BRANCH", label: "Paths", description: "Do different things depending on the data" },
  { type: "LOOP", label: "Loop", description: "Run steps once for each item in a list" },
];

export const FILTER_OPERATORS = [
  { value: "EQUALS", label: "equals" },
  { value: "NOT_EQUALS", label: "does not equal" },
  { value: "CONTAINS", label: "contains" },
  { value: "GREATER_THAN", label: "is greater than" },
  { value: "LESS_THAN", label: "is less than" },
  { value: "EXISTS", label: "exists" },
];

const DEFAULTS = {
  ACTION: { name: "Choose an app", config: {} },
  AI: { name: "AI prompt", config: { prompt: "" } },
  FILTER: { name: "Filter", config: { path: "", operator: "EQUALS", value: "" } },
  DELAY: { name: "Delay", config: { seconds: 30 } },
  BRANCH: { name: "Paths", config: {} },
  LOOP: { name: "Loop", config: { arrayPath: "" } },
};

export function createStep(type, id) {
  const d = DEFAULTS[type] || { name: "Step", config: {} };
  const step = { id, type, name: d.name, config: { ...d.config }, isConfigured: false };
  // Paths start with "Path A" (has a rule) and the fallback path; a Loop starts empty.
  if (type === "BRANCH") {
    step.paths = [
      { id: `${id}-a`, name: "Path A", condition: { path: "", operator: "EQUALS", value: "" }, steps: [] },
      { id: `${id}-else`, name: "Otherwise", condition: null, steps: [] },
    ];
  }
  if (type === "LOOP") step.steps = [];
  return step;
}

/** Small label above a card title: "Trigger", "Action", "Filter"... */
export function stepEyebrow(type) {
  if (type === "WEBHOOK" || type === "POLLING") return "Trigger";
  return STEP_KINDS.find((k) => k.type === type)?.label.replace("App action", "Action") || "Step";
}

export function getTriggerProviderOrDefault(providerId) {
  return triggerProviders.find((p) => p.id === (providerId || "webhook")) || triggerProviders[0];
}

/** { app, title, summary } for the trigger card. */
export function describeTriggerCard(trigger) {
  const provider = getTriggerProviderOrDefault(trigger?.config?.provider);
  if (!trigger?.isConfigured) {
    return { app: null, title: "Choose a trigger", summary: "Pick the app and event that start this Zap" };
  }
  const event = provider.events.find((e) => e.id === trigger.config?.event);
  const detail =
    provider.id === "github" ? trigger.config?.repo :
    provider.id === "gmail" ? (trigger.config?.query ? `matching "${trigger.config.query}"` : "any new email") :
    provider.id === "slack" ? (trigger.config?.channelName ? `#${trigger.config.channelName}` : null) :
    null;
  return {
    app: provider.id,
    title: event?.name || provider.name,
    summary: [provider.name, detail].filter(Boolean).join(" · "),
  };
}

const truncate = (text, n) => (text.length > n ? `${text.slice(0, n)}…` : text);

/** { app, title, summary } for a step card. */
export function describeStepCard(step, registry = {}) {
  const config = step?.config || {};
  if (step?.type === "ACTION") {
    if (config.provider) {
      const app = registry.getIntegration?.(config.provider);
      const action = registry.getIntegrationAction?.(config.provider, config.action);
      return {
        app: config.provider,
        title: action?.name || "Choose an action",
        summary: step.isConfigured ? app?.name || config.provider : `${app?.name || config.provider} · needs setup`,
      };
    }
    if (config.url) {
      return { app: null, title: "HTTP request", summary: `${config.method || "POST"} ${truncate(config.url, 40)}` };
    }
    return { app: null, title: "Choose an app", summary: "Pick the app and what it should do" };
  }
  if (step?.type === "FILTER") {
    const op = FILTER_OPERATORS.find((o) => o.value === config.operator)?.label || "equals";
    if (!config.path) return { app: null, title: step.name || "Filter", summary: "Set the condition to continue" };
    const value = config.operator === "EXISTS" ? "" : ` "${config.value ?? ""}"`;
    return { app: null, title: step.name || "Filter", summary: `Only continue if ${config.path} ${op}${value}` };
  }
  if (step?.type === "DELAY") {
    const s = Number(config.seconds) || 0;
    return { app: null, title: step.name || "Delay", summary: `Wait ${formatSeconds(s)}` };
  }
  if (step?.type === "AI") {
    return {
      app: null,
      title: step.name || "AI prompt",
      summary: config.prompt ? `"${truncate(config.prompt, 50)}"` : "Write the prompt",
    };
  }
  if (step?.type === "BRANCH") {
    const paths = step.paths || [];
    const unset = paths.some((p) => p.condition && !p.condition.path);
    return {
      app: null,
      title: step.name || "Paths",
      summary: paths.some((p) => p.condition)
        ? `Split into ${paths.length} path${paths.length === 1 ? "" : "s"}${unset ? " · rules need setup" : ""}`
        : "Add a path with a rule",
    };
  }
  if (step?.type === "LOOP") {
    return {
      app: null,
      title: step.name || "Loop",
      summary: config.arrayPath ? `For each item in ${config.arrayPath}` : "Choose the list to loop over",
    };
  }
  return { app: null, title: step?.name || "Step", summary: "Configured outside the builder" };
}

/** A path's rule as a sentence: "If trigger.vip equals "yes"" (null rule = the fallback path). */
export function describePathRule(condition) {
  if (!condition) return "If no other path matches";
  if (!condition.path) return "Set the rule for this path";
  const op = FILTER_OPERATORS.find((o) => o.value === condition.operator)?.label || "equals";
  return condition.operator === "EXISTS" ? `If ${condition.path} exists` : `If ${condition.path} ${op} "${condition.value ?? ""}"`;
}

export function formatSeconds(s) {
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  if (s % 3600 === 0) return `${s / 3600} hour${s === 3600 ? "" : "s"}`;
  if (s % 60 === 0) return `${s / 60} minute${s === 60 ? "" : "s"}`;
  return `${s} seconds`;
}
