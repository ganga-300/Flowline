import { triggerProviders } from "../../integrations/triggers.js";

/**
 * Human-readable summary of a Zap's trigger for cards and headers.
 * { app: "github", appName: "GitHub", event: "New Issue Created", detail: "octo/demo" }
 */
export function describeTrigger(trigger) {
  const config = trigger?.config || {};
  const appId = config.provider || (trigger?.type === "WEBHOOK" ? "webhook" : null);
  const provider = triggerProviders.find((p) => p.id === appId);
  const event = provider?.events.find((e) => e.id === config.event) || provider?.events[0];

  let detail = "";
  if (appId === "github") detail = config.repo || "";
  else if (appId === "gmail") detail = config.query ? `Matching "${config.query}"` : "Any new email";
  else if (appId === "slack") detail = config.channelName ? `#${config.channelName}` : config.channel ? "Selected channel" : "";
  else if (appId === "webhook") detail = "Incoming HTTP request";

  return {
    app: appId || "unknown",
    appName: provider?.name || "Unknown trigger",
    event: event?.name || (trigger?.type ? trigger.type.toLowerCase() : "No trigger"),
    detail,
  };
}
