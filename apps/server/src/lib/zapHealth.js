/**
 * For the dashboard: which connected accounts a Flow uses that need reconnecting, and its
 * latest run. Pure, so it's unit-tested; GET /zaps loads the rows (no tokens).
 */

// Selected with the Flow (never tokens).
const CONNECTION_SELECT = { id: true, provider: true, status: true, lastError: true };

/** "slack:Acme" -> { app: "slack", account: "Acme" } */
function describeConnection(provider) {
  const [app, ...rest] = String(provider || "").split(":");
  return { app, account: rest.join(":") };
}

/**
 * The distinct accounts (trigger first, then steps) marked "NEEDS_RECONNECT":
 * [{ connectionId, app, account, lastError }].
 */
function brokenConnections(zap) {
  const seen = new Map();
  const all = [zap?.trigger?.connection, ...(zap?.steps || []).map((s) => s.connection)];
  for (const c of all) {
    if (!c || c.status !== "NEEDS_RECONNECT" || seen.has(c.id)) continue;
    seen.set(c.id, { connectionId: c.id, ...describeConnection(c.provider), lastError: c.lastError || null });
  }
  return [...seen.values()];
}

/** The list shape: the Flow with its trigger, latest run and broken accounts (no step rows). */
function zapListItem(zap) {
  const item = { ...zap, lastRun: zap.runs?.[0] || null, brokenConnections: brokenConnections(zap) };
  delete item.steps;
  delete item.runs;
  return item;
}

module.exports = { CONNECTION_SELECT, describeConnection, brokenConnections, zapListItem };
