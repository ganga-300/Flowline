// Pure helpers for the dashboard: accounts that need reconnecting (GET /zaps returns
// `brokenConnections` per Flow) and each Flow's latest run (`lastRun`). No React here.
import { formatRelativeTime, runStatusMeta } from "../runs/runStatus.js";

const APP_NAMES = { github: "GitHub", gmail: "Gmail", slack: "Slack" };
export const appName = (id) => APP_NAMES[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : "App");

/** "Slack (Acme)", "GitHub (@octo)", or just "Slack". */
export function accountName({ app, account }) {
  if (!account) return appName(app);
  return `${appName(app)} (${app === "github" ? `@${account}` : account})`;
}

/**
 * Every account that needs reconnecting, once, with the names of the Flows using it:
 * [{ connectionId, app, account, zapNames }], in dashboard order.
 */
export function accountsNeedingReconnect(zaps = []) {
  const byId = new Map();
  for (const zap of zaps) {
    for (const c of zap.brokenConnections || []) {
      if (!byId.has(c.connectionId)) byId.set(c.connectionId, { connectionId: c.connectionId, app: c.app, account: c.account, zapNames: [] });
      byId.get(c.connectionId).zapNames.push(zap.zapName || "Untitled Flow");
    }
  }
  return [...byId.values()];
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Banner text for the dashboard, or null when every account works. */
export function reconnectBanner(accounts = []) {
  if (accounts.length === 0) return null;
  const zapCount = new Set(accounts.flatMap((a) => a.zapNames)).size;
  const title = accounts.length === 1
    ? `${accountName(accounts[0])} needs reconnecting`
    : `${accounts.length} connected accounts need reconnecting`;
  const who = accounts.length === 1 ? `${appName(accounts[0].app)} stopped accepting it` : "The apps stopped accepting them";
  return { title, body: `${who}, so ${plural(zapCount, "Flow")} can't run until you reconnect.` };
}

/** Warning on one Flow's card, or null. */
export function zapReconnectWarning(zap) {
  const broken = zap?.brokenConnections || [];
  if (broken.length === 0) return null;
  return `Reconnect ${broken.map(accountName).join(" and ")}: this Flow can't run until you do.`;
}

/** The Apps page link that opens the app needing a reconnect. */
export function reconnectHref(zap) {
  const app = zap?.brokenConnections?.[0]?.app;
  return app ? `/connections?app=${encodeURIComponent(app)}` : "/connections";
}

/** { tone, label, when, href, failing } for the card's "Last run" line, or null if it never ran. */
export function lastRunSummary(zap, now = Date.now()) {
  const run = zap?.lastRun;
  if (!run) return null;
  const meta = runStatusMeta(run);
  return {
    tone: meta.tone,
    label: meta.label,
    when: formatRelativeTime(run.createdAt, now),
    href: `/flows/${zap.id}/runs?run=${encodeURIComponent(run.id)}`,
    failing: run.status === "FAILED",
  };
}
