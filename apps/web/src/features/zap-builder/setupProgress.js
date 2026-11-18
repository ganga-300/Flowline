// The drawer's progress strip (App & event → Account → Configure → Test), as pure functions.
// Each stage: { id, label, done, tab } - tab is where the stage is edited ("setup" | "test").

const OAUTH_APPS = new Set(["github", "gmail", "slack"]);

const filled = (v) => v !== undefined && v !== null && String(v).trim() !== "";

/** Step kinds that have a Test tab (the others can't be run on their own). */
export function canTest(isTrigger, type) {
  return isTrigger || type === "ACTION" || type === "FILTER" || type === "AI";
}

/**
 * Stages for the trigger or step being edited.
 * getAction(provider, action) returns the action definition (with fields[].required).
 * tested: the last test in the drawer succeeded (or, for a trigger, a sample was loaded).
 */
export function setupStages({ isTrigger, draft, tested = false, getAction = () => null }) {
  const config = draft?.config || {};
  const test = { id: "test", label: "Test", done: tested, tab: "test" };

  if (isTrigger) {
    const provider = config.provider;
    const stages = [{ id: "app", label: "App & event", done: filled(provider) && filled(config.event), tab: "setup" }];
    if (OAUTH_APPS.has(provider)) {
      stages.push({ id: "account", label: "Account", done: filled(draft.connectionId || config.connectionId), tab: "setup" });
      if (provider === "github") stages.push({ id: "configure", label: "Repository", done: filled(config.repo), tab: "setup" });
      if (provider === "slack") stages.push({ id: "configure", label: "Channel", done: filled(config.channel), tab: "setup" });
    }
    return [...stages, test];
  }

  switch (draft?.type) {
    case "ACTION": {
      // A new action has no app yet; an HTTP request is the one without a provider but with a url.
      if (!config.provider && config.url === undefined) {
        return [{ id: "app", label: "App & event", done: false, tab: "setup" }, test];
      }
      if (!config.provider || config.provider === "custom_http") {
        return [{ id: "configure", label: "Request", done: filled(config.url), tab: "setup" }, test];
      }
      const stages = [{ id: "app", label: "App & event", done: filled(config.action), tab: "setup" }];
      if (OAUTH_APPS.has(config.provider)) {
        stages.push({ id: "account", label: "Account", done: filled(config.connectionId), tab: "setup" });
      }
      const fields = getAction(config.provider, config.action)?.fields || [];
      const values = config.config || {};
      // A required field with a default (e.g. a style picker) is filled until it's cleared.
      const configured = filled(config.action) && fields.filter((f) => f.required).every((f) => filled(values[f.key] ?? f.defaultValue));
      stages.push({ id: "configure", label: "Configure", done: configured, tab: "setup" });
      return [...stages, test];
    }
    case "FILTER":
      return [{ id: "configure", label: "Rule", done: filled(config.path), tab: "setup" }, test];
    case "AI":
      return [{ id: "configure", label: "Prompt", done: filled(config.prompt), tab: "setup" }, test];
    case "DELAY":
      return [{ id: "configure", label: "Wait time", done: Number(config.seconds) > 0, tab: "setup" }];
    case "BRANCH": {
      const paths = draft.paths || [];
      return [{ id: "configure", label: "Path rules", done: paths.some((p) => p.condition) && paths.every((p) => !p.condition || filled(p.condition.path)), tab: "setup" }];
    }
    case "LOOP":
      return [{ id: "configure", label: "List to loop over", done: filled(config.arrayPath), tab: "setup" }];
    default:
      return [];
  }
}

const APP_NAMES = { github: "GitHub", gmail: "Gmail", slack: "Slack", formatter: "Formatter", math: "Math" };

/**
 * What still has to be set up before the trigger or step can run, or null when it's ready.
 * Returns { stage, message }: stage is the setup stage to jump to, message says what's missing.
 * The canvas's "Ready" badge, the drawer's Continue button and Publish all use this.
 */
export function missingSetup({ isTrigger = false, draft, getAction = () => null }) {
  const stage = setupStages({ isTrigger, draft, getAction }).find((s) => s.tab === "setup" && !s.done);
  if (!stage) return null;
  const config = draft?.config || {};
  const app = APP_NAMES[config.provider] || "app";

  const message = (() => {
    if (isTrigger) {
      if (stage.id === "app") return "Choose the app and event that start this Zap.";
      if (stage.id === "account") return `Choose a ${app} account, or connect one.`;
      return config.provider === "slack" ? "Choose the Slack channel to watch." : "Choose the repository to watch.";
    }
    switch (draft?.type) {
      case "ACTION": {
        if (stage.id === "app") return config.provider ? `Choose a ${app} action.` : "Choose an app for this step.";
        if (stage.id === "account") return `Choose a ${app} account, or connect one.`;
        if (!config.provider || config.provider === "custom_http") return "Enter the URL to send the request to.";
        const values = config.config || {};
        const missing = (getAction(config.provider, config.action)?.fields || [])
          .filter((f) => f.required && !filled(values[f.key] ?? f.defaultValue))
          .map((f) => f.label);
        return missing.length ? `Fill in ${listOf(missing)}.` : "Finish setting up this step.";
      }
      case "FILTER": return "Choose the field this filter checks.";
      case "AI": return "Write the prompt.";
      case "DELAY": return "Set how long to wait.";
      case "BRANCH": return "Give each path a rule (the field it checks).";
      case "LOOP": return "Choose the list to loop over.";
      default: return "Finish setting up this step.";
    }
  })();
  return { stage: stage.id, message };
}

function listOf(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Dot paths of every list (array) in a sample, e.g. ["trigger.items"], for the Loop picker. */
export function findListPaths(value, prefix = "trigger", depth = 0) {
  if (Array.isArray(value)) return [prefix];
  if (!value || typeof value !== "object" || depth > 5) return [];
  return Object.entries(value).flatMap(([key, v]) => findListPaths(v, `${prefix}.${key}`, depth + 1));
}

/** Dot paths of every plain value in a sample (for rule and filter field suggestions). */
export function findValuePaths(value, prefix = "trigger", depth = 0) {
  if (value && typeof value === "object" && !Array.isArray(value) && depth <= 5) {
    return Object.entries(value).flatMap(([key, v]) => findValuePaths(v, `${prefix}.${key}`, depth + 1));
  }
  return [prefix];
}
