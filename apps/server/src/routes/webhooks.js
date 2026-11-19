const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");
const { zapExecutionQueue } = require("../Queue");
const { createAndQueueRun } = require("../../../worker/src/runQueue");
const { webhookPayload, webhookIdempotencyKey } = require("../lib/webhookDelivery");

// Senders post JSON (parsed in index.js), HTML forms / many SaaS tools post urlencoded, and
// some post plain text. Anything else arrives with no parsed body and runs with {}.
router.use(express.urlencoded({ extended: true }));
router.use(express.text({ type: ["text/*", "application/xml"] }));

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

  const payload = webhookPayload(req.body);
  const idempotencyKey = webhookIdempotencyKey(trigger.id, { headers: req.headers || {}, payload });

  // One run per event (idempotencyKey) and one job per run (fixed jobId). A redelivered
  // event whose run was saved but never queued (crash in between) gets queued now.
  const { run, created } = await createAndQueueRun(prisma, zapExecutionQueue, {
    zapId: trigger.zapId,
    idempotencyKey,
    triggerPayload: payload,
  });

  return res.status(202).json({ accepted: true, runId: run.id, ...(!created && { duplicate: true }) });
});

module.exports = router;
