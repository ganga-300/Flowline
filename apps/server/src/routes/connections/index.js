const express = require("express");
const router = express.Router();
const prisma = require("../../prismaClient");
const requireAuth = require("../../middleware/auth");
const gmailRouter = require("./gmail");

// Mount Gmail OAuth routes
router.use("/gmail", gmailRouter);

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
      const email = parts[1] || "";
      return {
        id: conn.id,
        provider: providerName,
        email: email || `${providerName} Account (${conn.id.slice(-6)})`,
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
