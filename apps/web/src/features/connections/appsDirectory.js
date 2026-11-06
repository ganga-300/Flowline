// Pure helpers for the Apps directory (/connections): the app catalog, search + status
// filtering, and the small labels shown on tiles and in the app drawer. No React, so it
// can be unit tested with node --test.
import { triggerProviders } from "../../integrations/triggers.js";
import { formatterIntegration } from "../../integrations/formatter.js";
import { mathIntegration } from "../../integrations/math.js";

/** One-line purpose per app; falls back to the integration's own description. */
const PURPOSES = {
  gmail: "Send emails and start Zaps from new mail",
  slack: "Post messages and react to channel activity",
  github: "Open issues, comment and watch code pushes",
  webhook: "Catch incoming requests or call any URL",
  formatter: "Clean up text, dates and patterns",
  math: "Calculate, increment and round numbers",
};

/** Tips shown next to the connect button: which account the provider will connect. */
export const CONNECT_HINTS = {
  slack: "On Slack's page, pick the workspace that has your channels using the menu at the top right.",
  github: "GitHub shows an account picker, so you can connect an account other than the one you're signed in with.",
  gmail: "Google lets you choose which account to connect.",
};

const pick = ({ id, name, description }) => ({ id, name, description: description || "" });

function builtInApps() {
  const webhook = triggerProviders.find((p) => p.id === "webhook");
  return [
    {
      id: "webhook",
      name: "Webhooks",
      description: webhook?.description || "Catch and send HTTP requests",
      triggers: (webhook?.events || []).map(pick),
      actions: [{ id: "http_request", name: "HTTP request", description: "Send a request with your Zap's data to any URL" }],
    },
    formatterIntegration,
    mathIntegration,
  ];
}

/**
 * Every app in the directory, OAuth apps first.
 * kind: "oauth" (needs a connected account) or "builtin" (works without one).
 */
export function buildAppCatalog(oauthIntegrations = []) {
  const normalize = (app, kind) => ({
    id: app.id,
    name: app.name.replace(/ by Flowline$/, ""),
    kind,
    purpose: PURPOSES[app.id] || app.description || "",
    description: app.description || "",
    triggers: (app.triggers || []).map(pick),
    actions: (app.actions || []).map(pick),
  });
  return [
    ...oauthIntegrations.map((app) => normalize(app, "oauth")),
    ...builtInApps().map((app) => normalize(app, "builtin")),
  ];
}

/** { [provider]: connections[] } */
export function groupConnections(connections = []) {
  const byApp = {};
  for (const conn of connections) (byApp[conn.provider] ||= []).push(conn);
  return byApp;
}

const tokens = (query) => String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
const hasAll = (text, words) => words.every((w) => text.includes(w));
const textOf = (item) => `${item.name} ${item.description}`.toLowerCase();

/**
 * Why an app matches a search: null (no match), { field: "app" } when its name or purpose
 * matches, or { field: "trigger" | "action", name } for the first matching event.
 * Every word must appear somewhere. Order: app name, one event matching every word,
 * purpose/description, then words spread across the app's events.
 */
export function matchApp(app, query) {
  const words = tokens(query);
  if (words.length === 0) return { field: "app" };
  if (hasAll(app.name.toLowerCase(), words)) return { field: "app" };

  const events = [
    ...app.triggers.map((t) => ({ field: "trigger", item: t })),
    ...app.actions.map((a) => ({ field: "action", item: a })),
  ];
  const exact = events.find((e) => hasAll(textOf(e.item), words));
  if (exact) return { field: exact.field, name: exact.item.name };
  const appText = `${app.name} ${app.purpose} ${app.description}`.toLowerCase();
  if (hasAll(appText, words)) return { field: "app" };

  const everything = [appText, ...events.map((e) => textOf(e.item))].join(" ");
  if (!hasAll(everything, words)) return null;
  const partial = events.find((e) => words.some((w) => textOf(e.item).includes(w)));
  return partial ? { field: partial.field, name: partial.item.name } : { field: "app" };
}

/** "connected" | "not_connected" | "builtin" */
export function appStatus(app, byApp = {}) {
  if (app.kind === "builtin") return "builtin";
  return byApp[app.id]?.length ? "connected" : "not_connected";
}

export const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "connected", label: "Connected" },
  { id: "not_connected", label: "Not connected" },
];

/**
 * Apps for the current search and status filter, each with its `match` reason.
 * Built-in apps need no account, so they only appear under "All".
 */
export function filterApps(apps, { query = "", status = "all" } = {}, byApp = {}) {
  return apps
    .filter((app) => status === "all" || appStatus(app, byApp) === status)
    .map((app) => ({ app, match: matchApp(app, query) }))
    .filter((row) => row.match);
}

/** { all, connected, not_connected } counts for the segmented filter (ignores search). */
export function statusCounts(apps, byApp = {}) {
  const counts = { all: apps.length, connected: 0, not_connected: 0 };
  for (const app of apps) {
    const s = appStatus(app, byApp);
    if (s in counts) counts[s]++;
  }
  return counts;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "1 trigger · 2 actions" */
export function capabilitySummary(app) {
  return [
    app.triggers.length > 0 && plural(app.triggers.length, "trigger"),
    app.actions.length > 0 && plural(app.actions.length, "action"),
  ].filter(Boolean).join(" · ");
}

/** "Connected · 2 accounts" */
export function connectedLabel(count) {
  return `Connected · ${plural(count, "account")}`;
}

/** Account name as people know it: GitHub logins get an @. */
export function accountLabel(appId, conn) {
  if (appId === "github" && conn.email && !conn.email.includes("Account (")) return `@${conn.email}`;
  return conn.email;
}

export function connectedOn(date) {
  if (!date) return "";
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Used in 2 Zaps" / "Not used in any Zaps"; null when the server didn't say. */
export function usageText(usedBy) {
  if (!Array.isArray(usedBy)) return null;
  return usedBy.length === 0 ? "Not used in any Zaps" : `Used in ${plural(usedBy.length, "Zap")}`;
}

/** Quoted Zap names, at most `max`: "“A”, “B” and 2 more". */
export function zapNameList(usedBy = [], max = 3) {
  const names = usedBy.slice(0, max).map((z) => `“${z.zapName}”`);
  const rest = usedBy.length - names.length;
  if (rest > 0) return `${names.join(", ")} and ${rest} more`;
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Body text for the disconnect confirmation. */
export function disconnectWarning(appName, usedBy) {
  if (Array.isArray(usedBy) && usedBy.length > 0) {
    const verb = usedBy.length === 1 ? "uses" : "use";
    return `${zapNameList(usedBy)} ${verb} this account and will stop working until you choose another ${appName} account.`;
  }
  if (Array.isArray(usedBy)) return `No Zaps use this ${appName} account right now.`;
  return `Zaps that use this ${appName} account will stop working until you choose another account.`;
}
