const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const prisma = require("../prismaClient");
const requireAuth = require("../middleware/auth");

// GET /zaps - list all Zaps, newest first
router.get("/",requireAuth, async (req, res) => {
  const zaps = await prisma.zap.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
    include: { trigger: true },
  });

  res.json({ zaps });
});

// GET /zaps/:id - one Zap with trigger and step tree
router.get("/:id",requireAuth, async (req, res) => {
  const zap = await prisma.zap.findUnique({
    where: { id: req.params.id },
    include: {
      trigger: true,
      steps: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!zap) {
    return res.status(404).json({ error: "Zap not found" });
  }

  res.json({ zap });
});

// POST /zaps - create a Zap with Trigger and Steps
router.post("/",requireAuth, async (req, res) => {
  const { name, trigger, steps, status } = req.body;

  if (!name || !trigger || !trigger.type) {
    return res.status(400).json({ error: "Name and trigger.type are required" });
  }

  const webhookToken =
    trigger.type === "WEBHOOK"
      ? crypto.randomBytes(16).toString("hex")
      : undefined;

  const zap = await prisma.zap.create({
    data: {
      zapName: name,
      status: status || "ENABLED",
      userId: req.userId,
      trigger: {
        create: {
          type: trigger.type,
          config: trigger.config || {},
          pollIntervalSec: trigger.pollIntervalSec,
          ...(webhookToken && { webhookToken }),
        },
      },
      ...(Array.isArray(steps) && steps.length > 0 && {
        steps: {
          create: steps.map((s) => ({
            type: s.type,
            name: s.name,
            config: s.config || {},
            order: s.order,
            parentStepId: s.parentStepId,
            branchCondition: s.branchCondition,
          })),
        },
      }),
    },
    include: {
      trigger: true,
      steps: {
        orderBy: { order: "asc" },
      },
    },
  });

  return res.status(201).json({ zap });
});

// PATCH /zaps/:id - update name and/or status
router.patch("/:id",requireAuth, async (req, res) => {
  const { name, status } = req.body;

  if (status && !["ENABLED", "DISABLED"].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Must be ENABLED or DISABLED" });
  }

  const existingZap = await prisma.zap.findUnique({
    where: { id: req.params.id },
  });

  if (!existingZap) {
    return res.status(404).json({ error: "Zap not found" });
  }

  const zap = await prisma.zap.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { zapName: name }),
      ...(status !== undefined && { status }),
    },
    include: {
      trigger: true,
      steps: {
        orderBy: { order: "asc" },
      },
    },
  });

  res.json({ zap });
});

// GET /zaps/:id/runs?status=FAILED - execution history list
router.get("/:id/runs",requireAuth, async (req, res) => {
  try {
    const { status } = req.query;

    const runs = await prisma.zapRun.findMany({
      where: {
        zapId: req.params.id,
        ...(status && status !== "ALL" && { status }),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ runs });
  } catch (err) {
    console.error("Error fetching zap runs:", err);
    res.json({ runs: [] });
  }
});

// GET /zaps/:id/runs/:runId - one run's full step-by-step trace
router.get("/:id/runs/:runId",requireAuth, async (req, res) => {
  try {
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
  } catch (err) {
    console.error("Error fetching zap run trace:", err);
    res.status(500).json({ error: "Failed to fetch run trace" });
  }
});

module.exports = router;