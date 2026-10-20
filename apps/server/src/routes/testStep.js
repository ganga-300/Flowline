const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/auth");
const prisma = require("../prismaClient");
// Same payload builders the poller uses, so samples match real runs exactly.
const {
  githubIssuePayload,
  githubCommitPayload,
  gmailMessagePayload,
  slackMessagePayload,
} = require("../../../worker/src/integrations/triggerPayloads");
const { fetchChannelHistory } = require("../../../worker/src/integrations/slack/channelHistory");
const { createSlackNameResolver } = require("../../../worker/src/integrations/slack/names");

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
        if (connectionId) {
          // Handlers load the account by id, so check it's this user's before running anything.
          const owned = await prisma.connection.findFirst({ where: { id: connectionId, userId: req.userId } });
          if (!owned) {
            return res.status(404).json({ status: "ERROR", output: null, error: "Selected account not found. Please reselect it." });
          }
        }
        const stepObj = {
          id: "test-step",
          config: step.config,
          connectionId,
        };

        const result = await handler(stepObj, context);
        return res.json({ status: "SUCCESS", output: result.output, error: null });
      }

      // Fallback: custom HTTP request - same code the worker runs.
      if (!step.config?.url) {
        return res.json({ status: "ERROR", output: null, error: "No URL configured" });
      }
      try {
        const { executeHttpRequest } = require("../../../worker/src/integrations/http/request");
        const result = await executeHttpRequest(step.config, context);
        return res.json({ status: "SUCCESS", output: result.output, error: null });
      } catch (err) {
        return res.json({ status: "ERROR", output: null, error: err.message });
      }

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

    } else if (step.type === "FORMATTER") {
      const { executeFormatterStep } = require("../../../worker/src/formatter");
      const result = executeFormatterStep(step, context);
      return res.json({ status: "SUCCESS", output: result.output, error: null });

    } else if (step.type === "FILTER") {
      const { evaluateCondition } = require("../../../worker/src/conditions");
      // Published filters store { condition: {...} }; the builder panel stores the fields flat.
      const condition = step.config?.condition || step.config || {};
      const passed = evaluateCondition(context, condition);
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
    const trigger = await prisma.trigger.findFirst({
      where: { id: req.params.triggerId, zap: { userId: req.userId } },
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

/**
 * POST /zaps/test-step/fetch-sample
 * Fetches real sample data directly from the provider (GitHub, Gmail, Slack)
 * based on current trigger configuration in the builder.
 */
router.post("/fetch-sample", requireAuth, async (req, res) => {
  const { provider, event, config = {}, connectionId } = req.body;

  if (!provider) {
    return res.status(400).json({ error: "Provider is required" });
  }

  try {
    // Find connection if available
    let connection = null;
    if (connectionId) {
      connection = await prisma.connection.findFirst({
        where: { id: connectionId, userId: req.userId },
      });
    }
    if (!connection) {
      connection = await prisma.connection.findFirst({
        where: { userId: req.userId, provider: { startsWith: provider } },
        orderBy: { createdAt: "desc" },
      });
    }

    if (provider === "github") {
      const repo = config.repo || config.repository;
      if (!repo || !repo.trim()) {
        return res.status(400).json({ error: "Please choose or enter a repository name first." });
      }

      const cleanRepo = repo.trim().replace(/^https?:\/\/github\.com\//i, "");
      const headers = {
        "User-Agent": "Flowline-App",
        Accept: "application/vnd.github.v3+json",
      };

      if (connection?.accessToken) {
        headers.Authorization = `Bearer ${connection.accessToken}`;
      } else if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      }

      if (event === "new_push") {
        const ghRes = await fetch(`https://api.github.com/repos/${cleanRepo}/commits?per_page=1`, { headers });
        if (!ghRes.ok) {
          const errText = await ghRes.text().catch(() => "");
          return res.status(ghRes.status).json({
            error: `GitHub error (${ghRes.status}): Could not read commits for "${cleanRepo}". Check repo permissions.`,
          });
        }
        const commits = await ghRes.json();
        if (!Array.isArray(commits) || commits.length === 0) {
          return res.status(404).json({ error: `No commits found in ${cleanRepo}` });
        }
        return res.json({ success: true, sample: githubCommitPayload(commits[0], cleanRepo) });
      }

      // Default: new_issue
      const ghRes = await fetch(`https://api.github.com/repos/${cleanRepo}/issues?state=all&sort=created&direction=desc&per_page=5`, { headers });
      if (!ghRes.ok) {
        const errText = await ghRes.text().catch(() => "");
        return res.status(ghRes.status).json({
          error: `GitHub error (${ghRes.status}): Could not read issues for "${cleanRepo}". Check repo permissions.`,
        });
      }

      const items = await ghRes.json();
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(404).json({
          error: `No issues found in "${cleanRepo}". Create an issue on GitHub to test with real data!`,
        });
      }

      const issue = items.find((i) => !i.pull_request) || items[0];
      return res.json({ success: true, sample: githubIssuePayload(issue, cleanRepo) });
    }

    if (provider === "gmail") {
      if (!connection) {
        return res.status(400).json({ error: "Please connect your Gmail account in Setup first." });
      }

      let accessToken = connection.accessToken;
      const query = config.query || "";
      let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1`;
      if (query.trim()) {
        url += `&q=${encodeURIComponent(query.trim())}`;
      }

      let resGmail = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (resGmail.status === 401 && connection.refreshToken) {
        try {
          const { refreshGoogleAccessToken } = require("../../../worker/src/integrations/google/refreshToken");
          accessToken = await refreshGoogleAccessToken(connection.id, connection.refreshToken);
          resGmail = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        } catch (rfErr) {
          return res.status(401).json({ error: "Gmail token expired. Please reconnect your account." });
        }
      }

      if (!resGmail.ok) {
        return res.status(resGmail.status).json({ error: `Gmail API error (${resGmail.status}): Failed to fetch messages.` });
      }

      let listData = await resGmail.json();
      let messages = listData.messages || [];

      // If query returned no messages, fallback to any message
      if (messages.length === 0 && query.trim()) {
        const fallbackRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          messages = fallbackData.messages || [];
        }
      }

      if (messages.length === 0) {
        return res.status(404).json({ error: "No messages found in your Gmail account." });
      }

      const msgSummary = messages[0];
      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgSummary.id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!msgRes.ok) {
        return res.status(msgRes.status).json({ error: "Failed to fetch Gmail message details." });
      }

      const msgData = await msgRes.json();
      return res.json({ success: true, sample: gmailMessagePayload(msgData) });
    }

    if (provider === "slack") {
      if (!connection) {
        return res.status(400).json({ error: "Please connect your Slack account in Setup first." });
      }

      const accessToken = connection.accessToken;
      let channelId = config.channel || config.channelId;

      if (!channelId || channelId.startsWith("#")) {
        const listRes = await fetch("https://slack.com/api/conversations.list?types=public_channel,private_channel", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const listData = await listRes.json().catch(() => ({}));
        if (listData.ok && Array.isArray(listData.channels) && listData.channels.length > 0) {
          if (channelId && channelId.startsWith("#")) {
            const match = listData.channels.find((c) => `#${c.name}` === channelId || c.name === channelId.replace("#", ""));
            channelId = match ? match.id : listData.channels[0].id;
          } else {
            channelId = listData.channels[0].id;
          }
        }
      }

      if (!channelId) {
        return res.status(400).json({ error: "Please select a Slack channel first." });
      }

      // Same history reader as the poller (auto-joins public channels, explains private ones).
      let history;
      try {
        history = await fetchChannelHistory(accessToken, channelId);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }

      const validMessages = history.filter((m) => m.type === "message" && !m.subtype);
      if (validMessages.length === 0) {
        return res.status(404).json({ error: "No messages found in this channel yet. Send a message in Slack to test!" });
      }

      const latest = validMessages[0];
      const names = createSlackNameResolver(accessToken);
      const sample = slackMessagePayload(latest, channelId, {
        userName: await names.userName(latest.user),
        channelName: await names.channelName(channelId),
      });
      return res.json({ success: true, sample });
    }

    return res.status(400).json({ error: `Trigger provider "${provider}" does not support sample fetching.` });
  } catch (err) {
    console.error("[fetch-sample] Error:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch trigger sample" });
  }
});

module.exports = router;

