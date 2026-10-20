const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");
const requireAuth = require("../middleware/auth");

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
      const slackRes = await fetch(
        "https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=1000",
        { headers: { Authorization: `Bearer ${connection.accessToken}` } }
      );
      const data = await slackRes.json().catch(() => ({}));
      if (data.ok && Array.isArray(data.channels)) {
        const options = data.channels.map((c) => ({ label: `#${c.name}`, value: c.id }));
        return res.json({ options });
      }
      return fail(`Could not load Slack channels (${data.error || `HTTP ${slackRes.status}`}). Try reconnecting Slack.`);
    }

    if (type === "slack_users") {
      const slackRes = await fetch("https://slack.com/api/users.list", {
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
      return fail(`Could not load Slack users (${data.error || `HTTP ${slackRes.status}`}). Try reconnecting Slack.`);
    }

    if (type === "gmail_labels") {
      const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
        headers: { Authorization: `Bearer ${connection.accessToken}` },
      });
      const data = await gmailRes.json().catch(() => ({}));
      if (gmailRes.ok && Array.isArray(data.labels)) {
        const options = data.labels.map((l) => ({ label: l.name, value: l.id }));
        return res.json({ options });
      }
      return fail(`Could not load Gmail labels (HTTP ${gmailRes.status}). Try reconnecting Gmail.`);
    }

    if (type === "github_repos") {
      const reposRes = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
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
      return fail(`Could not load GitHub repositories (HTTP ${reposRes.status}). Try reconnecting GitHub.`);
    }

    return res.status(400).json({ error: `Unknown options type "${type}"`, options: [] });
  } catch (err) {
    console.error("[options] Error fetching choices:", err.message);
    res.status(500).json({ error: "Failed to fetch dynamic choices" });
  }
});

module.exports = router;
