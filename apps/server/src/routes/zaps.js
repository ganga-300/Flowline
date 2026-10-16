const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const prisma = require("../prismaClient");
const requireAuth = require("../middleware/auth");
const { zapExecutionQueue } = require("../queue");

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
          ...((trigger.connectionId || trigger.config?.connectionId) && {
            connectionId: trigger.connectionId || trigger.config?.connectionId,
          }),
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
router.patch("/:id", requireAuth, async (req, res) => {
  try {
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

    if (existingZap.userId !== req.userId) {
      return res.status(403).json({ error: "Unauthorized" });
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
  } catch (err) {
    console.error("Error updating zap:", err);
    res.status(500).json({ error: "Failed to update zap" });
  }
});

// DELETE /zaps/:id - delete a zap and all related runs, steps, and triggers
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const existingZap = await prisma.zap.findUnique({
      where: { id: req.params.id },
    });

    if (!existingZap) {
      return res.status(404).json({ error: "Zap not found" });
    }

    if (existingZap.userId !== req.userId) {
      return res.status(403).json({ error: "Unauthorized to delete this zap" });
    }

    await prisma.$transaction([
      prisma.zapRun.deleteMany({ where: { zapId: req.params.id } }),
      prisma.step.deleteMany({ where: { zapId: req.params.id } }),
      prisma.trigger.deleteMany({ where: { zapId: req.params.id } }),
      prisma.zap.delete({ where: { id: req.params.id } }),
    ]);

    return res.json({ success: true, message: "Zap deleted successfully" });
  } catch (err) {
    console.error("Error deleting zap:", err);
    return res.status(500).json({ error: "Failed to delete zap" });
  }
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

// POST /zaps/:id/runs/:runId/retry - re-queue a specific execution using its original triggerPayload
router.post("/:id/runs/:runId/retry", requireAuth, async (req, res) => {
  try {
    const zap = await prisma.zap.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!zap) {
      return res.status(404).json({ error: "Zap not found" });
    }

    const previousRun = await prisma.zapRun.findFirst({
      where: { id: req.params.runId, zapId: zap.id },
    });

    if (!previousRun) {
      return res.status(404).json({ error: "Original run not found" });
    }

    const idempotencyKey = `${zap.id}-retry-${previousRun.id}-${Date.now()}`;
    const newRun = await prisma.zapRun.create({
      data: {
        zapId: zap.id,
        status: "QUEUED",
        idempotencyKey,
        triggerPayload: previousRun.triggerPayload || { retriedFrom: previousRun.id },
      },
    });

    await zapExecutionQueue.add("execute-zap-run", { zapRunId: newRun.id });

    return res.status(202).json({
      success: true,
      runId: newRun.id,
      message: "Run re-queued successfully!",
    });
  } catch (err) {
    console.error("Error retrying run:", err);
    return res.status(500).json({ error: "Failed to retry run: " + err.message });
  }
});

// POST /zaps/:id/run - trigger a manual instant run for a Zap
router.post("/:id/run", requireAuth, async (req, res) => {
  try {
    const zap = await prisma.zap.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { trigger: true, steps: true },
    });

    if (!zap) {
      return res.status(404).json({ error: "Zap not found" });
    }

    // If Zap has a POLLING trigger (GitHub, Gmail, Slack), trigger instant real-time poll
    if (zap.trigger?.type === "POLLING") {
      try {
        const { pollSingleTrigger } = require("../../../worker/src/pollingCron");
        const fullTrigger = await prisma.trigger.findUnique({
          where: { id: zap.trigger.id },
          include: { connection: true },
        });

        if (fullTrigger) {
          await pollSingleTrigger(fullTrigger);
          const recentRun = await prisma.zapRun.findFirst({
            where: { zapId: zap.id },
            orderBy: { createdAt: "desc" },
          });

          return res.status(202).json({
            success: true,
            runId: recentRun?.id || null,
            message: `Checked ${zap.trigger.config?.provider || "trigger"} for new events and executed live!`,
          });
        }
      } catch (pollErr) {
        console.error("[manual run] Error executing poller:", pollErr);
      }
    }

    const payload = req.body?.payload || { manual: true, triggeredAt: new Date().toISOString() };
    const idempotencyKey = `${zap.id}-manual-${Date.now()}`;

    const run = await prisma.zapRun.create({
      data: {
        zapId: zap.id,
        status: "QUEUED",
        idempotencyKey,
        triggerPayload: payload,
      },
    });

    await zapExecutionQueue.add("execute-zap-run", { zapRunId: run.id });

    return res.status(202).json({ success: true, runId: run.id, message: "Zap triggered successfully" });
  } catch (err) {
    console.error("Error running zap:", err);
    return res.status(500).json({ error: "Failed to run zap: " + err.message });
  }
});

module.exports = router;