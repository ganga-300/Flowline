// Pure builder helpers: step kinds, new-step defaults and the one-line card summaries.
// App lookups are passed in (registry) so this file stays testable without the
// integration modules.
import { triggerProviders } from "../../integrations/triggers.js";

/** Kinds offered in the "add a step" menu, in display order. */
export const STEP_KINDS = [
  { type: "ACTION", label: "App action", description: "Do something in GitHub, Slack or Gmail" },
  { type: "FILTER", label: "Filter", description: "Only continue when a condition is true" },
  { type: "DELAY", label: "Delay", description: "Wait before the next step" },
  { type: "AI", label: "AI prompt", description: "Send a prompt built from earlier data" },
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
};

export function createStep(type, id) {
  const d = DEFAULTS[type] || { name: "Step", config: {} };
  return { id, type, name: d.name, config: { ...d.config }, isConfigured: false };
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
  return { app: null, title: step?.name || "Step", summary: "Configured outside the builder" };
}

export function formatSeconds(s) {
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  if (s % 3600 === 0) return `${s / 3600} hour${s === 3600 ? "" : "s"}`;
  if (s % 60 === 0) return `${s / 60} minute${s === 60 ? "" : "s"}`;
  return `${s} seconds`;
}
