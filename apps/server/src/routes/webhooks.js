const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const prisma = require("../prismaClient");
const { zapExecutionQueue } = require("../Queue");
const { createAndQueueRun } = require("../../../worker/src/runQueue");

router.post("/:token", async (req, res) => {
  const trigger = await prisma.trigger.findUnique({
    where: { webhookToken: req.params.token },
    include: { zap: true },
  });

  if (!trigger) {
    return res.status(404).json({ error: "Webhook not found" });
  }

  if (trigger.zap.status !== "ENABLED") {
    return res.status(200).json({ accepted: false, reason: "zap_disabled" });
  }

  const payloadHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(req.body))
    .digest("hex");
  const idempotencyKey = `${trigger.id}-${payloadHash}`;

  // One run per event (idempotencyKey) and one job per run (fixed jobId). A redelivered
  // event whose run was saved but never queued (crash in between) gets queued now.
  const { run, created } = await createAndQueueRun(prisma, zapExecutionQueue, {
    zapId: trigger.zapId,
    idempotencyKey,
    triggerPayload: req.body,
  });

  return res.status(202).json({ accepted: true, runId: run.id, ...(!created && { duplicate: true }) });
});

module.exports = router;
