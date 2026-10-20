const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const prisma = require("../prismaClient");
const requireAuth = require("../middleware/auth");
const { zapExecutionQueue } = require("../Queue");

// Every account referenced by the trigger or a step must belong to this user;
// otherwise a Zap could act through someone else's Gmail/Slack/GitHub.
async function ownsAllConnections(userId, trigger, steps) {
  const ids = [
    trigger?.connectionId,
    trigger?.config?.connectionId,
    ...(Array.isArray(steps) ? steps.flatMap((s) => [s.connectionId, s.config?.connectionId]) : []),
  ].filter(Boolean);
  const unique = [...new Set(ids)];
  if (unique.length === 0) return true;
  const owned = await prisma.connection.count({ where: { id: { in: unique }, userId } });
  return owned === unique.length;
}

// Fields that decide WHAT a polling trigger watches. If any change, the stored
// "last seen" marker belongs to something else and must be reset.
function triggerWatchKey(type, config = {}, connectionId = null) {
  return JSON.stringify([type, config.provider, config.event, config.repo, config.channel, config.query, connectionId]);
}

const ACCOUNT_ERROR = "One or more selected accounts were not found. Please reselect them in the builder.";

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
  // Only the owner's Zap: the response includes the webhook token and connection ids.
  const zap = await prisma.zap.findFirst({
    where: { id: req.params.id, userId: req.userId },
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

  if (!(await ownsAllConnections(req.userId, trigger, steps))) {
    return res.status(400).json({ error: ACCOUNT_ERROR });
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

// PUT /zaps/:id - edit a published Zap (name, trigger and steps).
// Existing steps are updated in place by id so their run history (StepExecution rows,
// deleted on cascade with a step) and `ref` (used by {{steps.<ref>...}}) are kept.
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { name, trigger, steps = [] } = req.body;
    if (!name || !trigger || !trigger.type) {
      return res.status(400).json({ error: "Name and trigger.type are required" });
    }

    const existing = await prisma.zap.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { trigger: true, steps: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Zap not found" });
    }

    if (!(await ownsAllConnections(req.userId, trigger, steps))) {
      return res.status(400).json({ error: ACCOUNT_ERROR });
    }
    const existingStepIds = new Set(existing.steps.map((st) => st.id));
    if (steps.some((st) => st.id && !existingStepIds.has(st.id))) {
      return res.status(400).json({ error: "A step in this request doesn't belong to this Zap." });
    }

    const connectionId = trigger.connectionId || trigger.config?.connectionId || null;
    const old = existing.trigger;
    const watchChanged = !old ||
      triggerWatchKey(old.type, old.config, old.connectionId) !== triggerWatchKey(trigger.type, trigger.config, connectionId);
    const triggerData = {
      type: trigger.type,
      config: trigger.config || {},
      pollIntervalSec: trigger.pollIntervalSec ?? null,
      connectionId: trigger.type === "POLLING" ? connectionId : null,
      ...(watchChanged && { lastPollHash: null }),
      ...(trigger.type === "WEBHOOK" && !old?.webhookToken && { webhookToken: crypto.randomBytes(16).toString("hex") }),
    };

    await prisma.$transaction(async (tx) => {
      await tx.zap.update({ where: { id: existing.id }, data: { zapName: name } });

      if (old) {
        await tx.trigger.update({ where: { id: old.id }, data: triggerData });
      } else {
        await tx.trigger.create({ data: { zapId: existing.id, ...triggerData } });
      }

      // Remove top-level steps the user deleted (the builder only edits top-level steps).
      const keptIds = steps.map((st) => st.id).filter(Boolean);
      await tx.step.deleteMany({ where: { zapId: existing.id, parentStepId: null, id: { notIn: keptIds } } });

      for (const st of steps) {
        const data = {
          type: st.type,
          name: st.name || `${st.type} Step`,
          config: st.config || {},
          order: st.order,
          connectionId: st.connectionId || st.config?.connectionId || null,
        };
        if (st.id) {
          await tx.step.update({ where: { id: st.id }, data });
        } else {
          await tx.step.create({ data: { zapId: existing.id, ...data } });
        }
      }
    });

    const zap = await prisma.zap.findFirst({
      where: { id: existing.id, userId: req.userId },
      include: { trigger: true, steps: { orderBy: { order: "asc" } } },
    });
    return res.json({ zap });
  } catch (err) {
    console.error("Error editing zap:", err);
    return res.status(500).json({ error: "Failed to save changes" });
  }
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

    const zap = await prisma.zap.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!zap) {
      return res.status(404).json({ error: "Zap not found" });
    }

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
    // The run must belong to this Zap, and the Zap to this user.
    const run = await prisma.zapRun.findFirst({
      where: { id: req.params.runId, zapId: req.params.id, zap: { userId: req.userId } },
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

    // Polling triggers (GitHub, Gmail, Slack): check the provider now and report exactly
    // what happened. Never fall through to a manual run - that would execute the actions
    // with fake trigger data and send blank messages/issues.
    if (zap.trigger?.type === "POLLING") {
      const { pollSingleTrigger } = require("../../../worker/src/pollingCron");
      const config = zap.trigger.config || {};
      const appName = { github: "GitHub", gmail: "Gmail", slack: "Slack" }[config.provider] || "the app";
      const noun = config.provider === "github" ? (config.event === "new_push" ? "commit" : "issue")
        : config.provider === "gmail" ? "email" : config.provider === "slack" ? "message" : "event";

      const before = await prisma.trigger.findUnique({
        where: { id: zap.trigger.id },
        include: { connection: true },
      });
      if (!before) {
        return res.status(404).json({ error: "Trigger not found" });
      }
      const runsBefore = await prisma.zapRun.count({ where: { zapId: zap.id } });

      try {
        await pollSingleTrigger(before);
      } catch (pollErr) {
        console.error("[manual run] Error executing poller:", pollErr.message);
        return res.status(502).json({ error: `Could not check ${appName} for new ${noun}s: ${pollErr.message}` });
      }

      const after = await prisma.trigger.findUnique({ where: { id: zap.trigger.id } });
      const newCount = (await prisma.zapRun.count({ where: { zapId: zap.id } })) - runsBefore;

      if (newCount > 0) {
        const newRuns = await prisma.zapRun.findMany({
          where: { zapId: zap.id },
          orderBy: { createdAt: "desc" },
          take: newCount,
          select: { id: true },
        });
        return res.status(202).json({
          success: true,
          newEvents: newCount,
          runId: newRuns[0]?.id || null,
          runIds: newRuns.map((r) => r.id),
          message: `Found ${newCount} new ${noun}${newCount === 1 ? "" : "s"} in ${appName}. Running now.`,
        });
      }

      if (!before.lastPollHash && after?.lastPollHash) {
        return res.json({
          success: true,
          newEvents: 0,
          runId: null,
          message: `First check done. Flowline will run this Zap for new ${noun}s from now on - create one and click Run again.`,
        });
      }

      if (!after?.lastPollHash) {
        return res.json({
          success: false,
          newEvents: 0,
          runId: null,
          message: `Couldn't read any ${noun}s from ${appName} yet. Check the trigger's account and settings (the server log shows the exact error).`,
        });
      }

      return res.json({
        success: true,
        newEvents: 0,
        runId: null,
        message: `No new ${noun}s in ${appName} since the last check.`,
      });
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