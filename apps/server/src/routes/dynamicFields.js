const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");
const requireAuth = require("../middleware/auth");

/**
 * GET /connections/:id/dynamic-fields?provider=google_sheets&action=append_row&parentValue=...
 * Returns dynamic child field definitions dependent on a parent field selection.
 */
router.get("/:id/dynamic-fields", requireAuth, async (req, res) => {
  const { provider, action, parentKey, parentValue } = req.query;

  try {
    const connection = await prisma.connection.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    if (provider === "google_sheets" && parentKey === "spreadsheetId" && parentValue) {
      // Fetch worksheet tabs for selected spreadsheet
      const sheetsRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${parentValue}?fields=sheets.properties`,
        {
          headers: { Authorization: `Bearer ${connection.accessToken}` },
        }
      );

      const data = await sheetsRes.json().catch(() => ({}));

      if (Array.isArray(data.sheets)) {
        const tabOptions = data.sheets.map((s) => ({
          label: s.properties?.title || "Sheet1",
          value: s.properties?.title || "Sheet1",
        }));

        return res.json({
          fields: [
            {
              key: "range",
              label: "Worksheet Tab Name",
              type: "dropdown",
              required: true,
              options: tabOptions,
              description: "Select the specific sheet tab to append rows to",
            },
          ],
        });
      }

      // Mock fallback
      return res.json({
        fields: [
          {
            key: "range",
            label: "Worksheet Tab Name",
            type: "dropdown",
            required: true,
            options: [
              { label: "Sheet1", value: "Sheet1" },
              { label: "Leads", value: "Leads" },
              { label: "Responses", value: "Responses" },
            ],
          },
        ],
      });
    }

    return res.json({ fields: [] });
  } catch (err) {
    console.error("[dynamic-fields] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch dynamic fields" });
  }
});

module.exports = router;
