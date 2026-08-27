const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");
const requireAuth = require("../middleware/auth");

// GET /alerts - List user's execution failure alerts
router.get("/", requireAuth, async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      include: {
        zap: { select: { zapName: true } },
      },
      take: 50,
    });
    res.json({ alerts });
  } catch (err) {
    console.error("[alerts] Error fetching alerts:", err.message);
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

// DELETE /alerts/:id - Dismiss an alert
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await prisma.alert.deleteMany({
      where: { id: req.params.id, userId: req.userId },
    });
    res.json({ success: true });
  } catch (err) {
    console.error("[alerts] Error deleting alert:", err.message);
    res.status(500).json({ error: "Failed to delete alert" });
  }
});

module.exports = router;
