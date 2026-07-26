const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");

// GET /zaps/:id/runs?status=FAILED - execution history list
router.get("/:id/runs", async (req, res) => {
  const { status } = req.query;

  const runs = await prisma.zapRun.findMany({
    where: {
      zapId: req.params.id,
      ...(status && { status }),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json({ runs });
});

// GET /zaps/:id/runs/:runId - one run's full step-by-step trace
router.get("/:id/runs/:runId", async (req, res) => {
  const run = await prisma.zapRun.findUnique({
    where: { id: req.params.runId },
    include: {
      stepExecutions: {
        include: { step: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!run) {
    return res.status(404).json({ error: "Run not found" });
  }

  res.json({ run });
});

module.exports = router;