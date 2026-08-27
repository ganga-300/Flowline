const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/auth");
const prisma = require("../prismaClient");

/**
 * POST /zaps/test-step
 * Executes a single step in isolation for testing purposes.
 * 
 * Body: {
 *   step: { type, config, connectionId? },
 *   sampleContext: { trigger: {...}, steps: {...} }
 * }
 * 
 * Returns: { status, output, error }
 */
router.post("/", requireAuth, async (req, res) => {
  const { step, sampleContext = {} } = req.body;

  if (!step || !step.type) {
    return res.status(400).json({ error: "step.type is required" });
  }

  const context = {
    trigger: sampleContext.trigger || sampleContext || {},
    steps: sampleContext.steps || {},
  };

  try {
    if (step.type === "ACTION") {
      const provider = step.config?.provider;
      const action = step.config?.action;

      if (provider && action) {
        // Use the worker's integration handlers
        const { getIntegrationHandler } = require("../../../worker/src/integrations/registry");
        const handler = getIntegrationHandler(provider, action);

        if (!handler) {
          return res.json({
            status: "ERROR",
            output: null,
            error: `No integration handler found for ${provider}:${action}`,
          });
        }

        // Build a step-like object matching what the worker expects
        const connectionId = step.connectionId || step.config?.connectionId;
        const stepObj = {
          id: "test-step",
          config: step.config,
          connectionId,
        };

        const result = await handler(stepObj, context);
        return res.json({ status: "SUCCESS", output: result.output, error: null });
      }

      // Fallback: custom HTTP request
      const { url, method = "POST", body = {} } = step.config || {};
      if (!url) {
        return res.json({ status: "ERROR", output: null, error: "No URL configured" });
      }

      const { resolveTemplate } = require("../../../worker/src/conditions");
      const resolvedUrl = resolveTemplate(context, url);
      const resolvedBody = typeof body === "string" ? resolveTemplate(context, body) : body;

      const fetchRes = await fetch(resolvedUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(resolvedBody),
      });
      const output = await fetchRes.json().catch(() => ({}));
      return res.json({ status: "SUCCESS", output, error: null });

    } else if (step.type === "AI") {
      const { resolveTemplate } = require("../../../worker/src/conditions");
      const prompt = resolveTemplate(context, step.config?.prompt || step.config?.promptTemplate || "");

      const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: step.config?.model || "meta-llama/llama-3.1-8b-instruct:free",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        return res.json({ status: "ERROR", output: null, error: `AI step failed: ${aiRes.status} ${errText}` });
      }

      const data = await aiRes.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      return res.json({ status: "SUCCESS", output: { content }, error: null });

    } else if (step.type === "FILTER") {
      const { evaluateCondition } = require("../../../worker/src/conditions");
      const passed = evaluateCondition(context, step.config?.condition || {});
      return res.json({ status: "SUCCESS", output: { passed }, error: null });

    } else {
      return res.json({
        status: "ERROR",
        output: null,
        error: `Step type "${step.type}" cannot be tested in isolation`,
      });
    }
  } catch (err) {
    console.error("[test-step] Error:", err.message);
    return res.json({ status: "ERROR", output: null, error: err.message });
  }
});

/**
 * GET /zaps/test-step/sample/:triggerId
 * Returns the most recent trigger payload for a given trigger ID (for sample data loading)
 */
router.get("/sample/:triggerId", requireAuth, async (req, res) => {
  try {
    const trigger = await prisma.trigger.findUnique({
      where: { id: req.params.triggerId },
      include: { zap: true },
    });

    if (!trigger) {
      return res.status(404).json({ error: "Trigger not found" });
    }

    // Find the most recent run for this zap to get sample payload
    const lastRun = await prisma.zapRun.findFirst({
      where: { zapId: trigger.zapId },
      orderBy: { createdAt: "desc" },
    });

    if (!lastRun) {
      return res.json({
        sample: {
          body: {
            email: "user@example.com",
            name: "Alex Smith",
            message: "Sample webhook payload",
          },
        },
        source: "default",
      });
    }

    return res.json({ sample: lastRun.triggerPayload, source: "last_run" });
  } catch (err) {
    console.error("[test-step] Error fetching sample:", err.message);
    return res.status(500).json({ error: "Failed to fetch sample data" });
  }
});

module.exports = router;
