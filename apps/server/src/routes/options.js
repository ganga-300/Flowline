const express = require("express");
const { fetchWithTimeout } = require("../../../worker/src/fetchWithTimeout");
const router = express.Router();
const prisma = require("../prismaClient");
const requireAuth = require("../middleware/auth");
const { refreshGoogleAccessToken } = require("../../../worker/src/integrations/google/refreshToken");
const { SLACK_AUTH_CODES, isAuthFailure } = require("../../../worker/src/authFailure");

// The app rejected the account's token: flag it like the worker does, so the Apps page
// shows "Reconnect" (reconnecting through OAuth clears it).
async function markNeedsReconnect(connectionId, message) {
  try {
    // Like the worker: only the first failure is recorded (keeps "since <date>").
    await prisma.connection.updateMany({
      where: { id: connectionId, status: { not: "NEEDS_RECONNECT" } },
      data: { status: "NEEDS_RECONNECT", lastError: String(message).slice(0, 500), lastErrorAt: new Date() },
    });
  } catch (err) {
    console.error(`[options] could not mark connection ${connectionId} as broken:`, err.message);
  }
}

/** GET a Gmail API URL with the connection's token, refreshing it once on 401 (it lasts ~1 hour). */
async function gmailGet(connection, url) {
  const send = (token) => fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
  let res = await send(connection.accessToken);
  if (res.status === 401 && connection.refreshToken) {
    const fresh = await refreshGoogleAccessToken(connection.id, connection.refreshToken, { db: prisma });
    res = await send(fresh);
  }
  return res;
}

/**
 * GET /connections/:id/options?type=slack_channels|slack_users|gmail_labels|github_repos
 * Fetches dynamic option choices from third-party APIs for form dropdowns.
 */
router.get("/:id/options", requireAuth, async (req, res) => {
  const { type } = req.query;

  try {
    const connection = await prisma.connection.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    // On any provider failure we return an error instead of placeholder choices:
    // fake IDs would be saved into the Zap and only fail later at runtime.
    const fail = (message) => res.status(502).json({ error: message, options: [] });

    if (type === "slack_channels") {
      const slackRes = await fetchWithTimeout(
        "https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=1000",
        { headers: { Authorization: `Bearer ${connection.accessToken}` } }
      );
      const data = await slackRes.json().catch(() => ({}));
      if (data.ok && Array.isArray(data.channels)) {
        const options = data.channels.map((c) => ({ label: `#${c.name}`, value: c.id }));
        return res.json({ options });
      }
      if (SLACK_AUTH_CODES.has(data.error)) await markNeedsReconnect(connection.id, `Slack rejected this connection (${data.error}).`);
      return fail(`Could not load Slack channels (${data.error || `HTTP ${slackRes.status}`}). Try reconnecting Slack.`);
    }

    if (type === "slack_users") {
      const slackRes = await fetchWithTimeout("https://slack.com/api/users.list", {
        headers: { Authorization: `Bearer ${connection.accessToken}` },
      });
      const data = await slackRes.json().catch(() => ({}));
      if (data.ok && Array.isArray(data.members)) {
        const options = data.members
          .filter((m) => !m.deleted && !m.is_bot && m.id !== "USLACKBOT")
          .map((m) => ({
            label: `${m.real_name || m.name} (@${m.name})`,
            value: m.id,
          }));
        return res.json({ options });
      }
      if (SLACK_AUTH_CODES.has(data.error)) await markNeedsReconnect(connection.id, `Slack rejected this connection (${data.error}).`);
      return fail(`Could not load Slack users (${data.error || `HTTP ${slackRes.status}`}). Try reconnecting Slack.`);
    }

    if (type === "gmail_labels") {
      let gmailRes;
      try {
        gmailRes = await gmailGet(connection, "https://gmail.googleapis.com/gmail/v1/users/me/labels");
      } catch (err) {
        if (!isAuthFailure(err)) throw err;
        await markNeedsReconnect(connection.id, err.message);
        return fail(err.message);
      }
      const data = await gmailRes.json().catch(() => ({}));
      if (gmailRes.ok && Array.isArray(data.labels)) {
        const options = data.labels.map((l) => ({ label: l.name, value: l.id }));
        return res.json({ options });
      }
      if (gmailRes.status === 401) await markNeedsReconnect(connection.id, "Google rejected this Gmail connection (401).");
      return fail(`Could not load Gmail labels (HTTP ${gmailRes.status}). Try reconnecting Gmail.`);
    }

    if (type === "github_repos") {
      const reposRes = await fetchWithTimeout("https://api.github.com/user/repos?per_page=100&sort=updated", {
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "User-Agent": "Flowline-App",
        },
      });
      const data = await reposRes.json().catch(() => null);
      if (reposRes.ok && Array.isArray(data)) {
        const options = data.map((r) => ({ label: r.full_name, value: r.full_name }));
        return res.json({ options });
      }
      if (reposRes.status === 401) await markNeedsReconnect(connection.id, "GitHub rejected this connection (401 Bad credentials).");
      return fail(`Could not load GitHub repositories (HTTP ${reposRes.status}). Try reconnecting GitHub.`);
    }

    return res.status(400).json({ error: `Unknown options type "${type}"`, options: [] });
  } catch (err) {
    console.error("[options] Error fetching choices:", err.message);
    res.status(500).json({ error: "Failed to fetch dynamic choices" });
  }
});

module.exports = router;
