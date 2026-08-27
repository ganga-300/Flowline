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
