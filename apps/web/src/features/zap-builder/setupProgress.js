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
    const provider = config.provider || "webhook";
    const stages = [{ id: "app", label: "App & event", done: filled(config.event), tab: "setup" }];
    if (OAUTH_APPS.has(provider)) {
      stages.push({ id: "account", label: "Account", done: filled(draft.connectionId || config.connectionId), tab: "setup" });
      if (provider === "github") stages.push({ id: "configure", label: "Repository", done: filled(config.repo), tab: "setup" });
      if (provider === "slack") stages.push({ id: "configure", label: "Channel", done: filled(config.channel), tab: "setup" });
    }
    return [...stages, test];
  }

  switch (draft?.type) {
    case "ACTION": {
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
