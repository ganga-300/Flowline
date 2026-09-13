const express = require("express");
const router = express.Router();
const prisma = require("../../prismaClient");
const requireAuth = require("../../middleware/auth");
const gmailRouter = require("./gmail");
const slackRouter = require("./slack");
const githubRouter = require("./github");

// Mount OAuth provider routers
router.use("/gmail", gmailRouter);
router.use("/slack", slackRouter);
router.use("/github", githubRouter);

/**
 * GET /connections
 * Returns a list of safe user connections (filtering out secret tokens)
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { provider } = req.query;

    const where = { userId: req.userId };
    if (provider) {
      where.provider = { startsWith: provider };
    }

    const rawConnections = await prisma.connection.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const connections = rawConnections.map((conn) => {
      const parts = conn.provider.split(":");
      const providerName = parts[0];
      const detail = parts[1] || "";
      return {
        id: conn.id,
        provider: providerName,
        email: detail || `${providerName} Account (${conn.id.slice(-6)})`,
        createdAt: conn.createdAt,
      };
    });

    res.json({ connections });
  } catch (err) {
    console.error("Error fetching connections:", err);
    res.status(500).json({ error: "Failed to fetch connections" });
  }
});

module.exports = router;
