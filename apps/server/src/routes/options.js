const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");
const requireAuth = require("../middleware/auth");

/**
 * GET /connections/:id/options?type=slack_channels|google_sheets|gmail_labels
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

    if (type === "slack_channels") {
      // Call Slack API or fallback if webhook connection
      const slackRes = await fetch("https://slack.com/api/conversations.list?types=public_channel,private_channel", {
        headers: { Authorization: `Bearer ${connection.accessToken}` },
      });
      const data = await slackRes.json().catch(() => ({}));
      if (data.ok && Array.isArray(data.channels)) {
        const options = data.channels.map((c) => ({ label: `#${c.name}`, value: c.id }));
        return res.json({ options });
      }
      // Mock / fallback options
      return res.json({
        options: [
          { label: "#general", value: "#general" },
          { label: "#random", value: "#random" },
          { label: "#alerts", value: "#alerts" },
          { label: "#leads", value: "#leads" },
        ],
      });
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
      return res.json({
        options: [
          { label: "Jane Doe (@jane)", value: "U123456" },
          { label: "Alex Smith (@alex)", value: "U654321" },
        ],
      });
    }

    if (type === "gmail_labels") {
      const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
        headers: { Authorization: `Bearer ${connection.accessToken}` },
      });
      const data = await gmailRes.json().catch(() => ({}));
      if (Array.isArray(data.labels)) {
        const options = data.labels.map((l) => ({ label: l.name, value: l.id }));
        return res.json({ options });
      }
      return res.json({
        options: [
          { label: "INBOX", value: "INBOX" },
          { label: "IMPORTANT", value: "IMPORTANT" },
          { label: "STARRED", value: "STARRED" },
        ],
      });
    }

    if (type === "google_sheets" || type === "sheets") {
      const driveRes = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&pageSize=20",
        {
          headers: { Authorization: `Bearer ${connection.accessToken}` },
        }
      );
      const data = await driveRes.json().catch(() => ({}));
      if (Array.isArray(data.files)) {
        const options = data.files.map((f) => ({ label: f.name, value: f.id }));
        return res.json({ options });
      }
      return res.json({
        options: [
          { label: "Leads Spreadsheet 2026", value: "1BxiMVs0XRn5nW..." },
          { label: "Customer Support Queue", value: "1a2b3c4d5e6f..." },
        ],
      });
    }

    if (type === "github_repos") {
      const reposRes = await fetch("https://api.github.com/user/repos?per_page=30&sort=updated", {
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "User-Agent": "Flowline-App",
        },
      });
      const data = await reposRes.json().catch(() => []);
      if (Array.isArray(data)) {
        const options = data.map((r) => ({ label: r.full_name, value: r.full_name }));
        return res.json({ options });
      }
      return res.json({
        options: [
          { label: "my-org/backend-api", value: "my-org/backend-api" },
          { label: "my-org/frontend-web", value: "my-org/frontend-web" },
        ],
      });
    }

    return res.json({
      options: [
        { label: "Option 1", value: "opt_1" },
        { label: "Option 2", value: "opt_2" },
      ],
    });
  } catch (err) {
    console.error("[options] Error fetching choices:", err.message);
    res.status(500).json({ error: "Failed to fetch dynamic choices" });
  }
});

module.exports = router;
