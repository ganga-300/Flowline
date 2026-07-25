const express = require("express");
const crypto = require("crypto");
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

  const payloadHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(req.body))
    .digest("hex");
  const idempotencyKey = `${trigger.id}-${payloadHash}`;

  try {
    const run = await prisma.zapRun.create({
      data: {
        zapId: trigger.zapId,
        status: "QUEUED",
        idempotencyKey,
        triggerPayload: req.body,
      },
    });

    await zapExecutionQueue.add("execute-zap-run", { zapRunId: run.id });

    return res.status(202).json({ accepted: true, runId: run.id });
  } catch (err) {
    if (err.code === "P2002") {
      const existing = await prisma.zapRun.findUnique({ where: { idempotencyKey } });
      return res.status(202).json({ accepted: true, runId: existing.id, duplicate: true });
    }
    throw err;
  }
});

module.exports = router;
