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

// Zaps (owned by this user) whose trigger or steps use a connection, for "Used in N Zaps".
const ownZap = (userId) => ({
  where: { zap: { userId } },
  select: { zap: { select: { id: true, zapName: true, status: true } } },
});

function zapsUsing(conn) {
  const byId = new Map();
  for (const { zap } of [...(conn.triggers || []), ...(conn.steps || [])]) {
    if (zap && !byId.has(zap.id)) byId.set(zap.id, { zapId: zap.id, zapName: zap.zapName, status: zap.status });
  }
  return [...byId.values()].sort((a, b) => a.zapName.localeCompare(b.zapName));
}

/**
 * GET /connections
 * Returns a list of safe user connections (filtering out secret tokens),
 * each with `usedBy`: the distinct Zaps that use it.
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
      // One findMany: Prisma batches the relation loads (no query per connection).
      include: { triggers: ownZap(req.userId), steps: ownZap(req.userId) },
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
        // "OK" or "NEEDS_RECONNECT" (the app rejected the token; set by the worker).
        status: conn.status || "OK",
        lastError: conn.lastError || null,
        lastErrorAt: conn.lastErrorAt || null,
        usedBy: zapsUsing(conn),
      };
    });

    res.json({ connections });
  } catch (err) {
    console.error("Error fetching connections:", err);
    res.status(500).json({ error: "Failed to fetch connections" });
  }
});

/**
 * DELETE /connections/:id
 * Disconnect / remove a saved connection (ownership check enforced).
 * Zaps that use it can't work without it, so the ones that are on are turned off in the
 * same transaction (instead of staying "on" and failing every run). Response:
 * { success, disabledZaps: [{ zapId, zapName }] } - the Zaps that were turned off.
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const connection = await prisma.connection.findUnique({
      where: { id: req.params.id },
      include: { triggers: ownZap(req.userId), steps: ownZap(req.userId) },
    });

    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }
    if (connection.userId !== req.userId) {
      return res.status(403).json({ error: "Not authorized to delete this connection" });
    }

    const disabledZaps = zapsUsing(connection)
      .filter((z) => z.status === "ENABLED")
      .map(({ zapId, zapName }) => ({ zapId, zapName }));

    await prisma.$transaction([
      prisma.zap.updateMany({
        where: { id: { in: disabledZaps.map((z) => z.zapId) }, userId: req.userId, status: "ENABLED" },
        data: { status: "DISABLED" },
      }),
      prisma.connection.delete({ where: { id: req.params.id } }),
    ]);
    res.json({ success: true, disabledZaps });
  } catch (err) {
    console.error("Error deleting connection:", err);
    res.status(500).json({ error: "Failed to delete connection" });
  }
});

module.exports = router;
