const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");
const { zapExecutionQueue } = require("../queue");

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

  const run = await prisma.zapRun.create({
    data: {
      zapId: trigger.zapId,
      status: "QUEUED",
      idempotencyKey: `${trigger.id}-${Date.now()}`,
      triggerPayload: req.body,
    },
  });

  await zapExecutionQueue.add("execute-zap-run", { zapRunId: run.id });

  res.status(202).json({ accepted: true, runId: run.id });
});

module.exports = router;
