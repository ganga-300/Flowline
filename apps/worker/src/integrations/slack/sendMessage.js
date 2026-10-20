const prisma = require("../../prismaClient");
const { resolveTemplate } = require("../../conditions");
const TokenBucket = require("../../rateLimiter");
const { slackApiError } = require("./errors");

// Slack rate limiter: 5 messages burst capacity, 1 msg/sec refill rate
const slackBucket = new TokenBucket(5, 1);

/**
 * Slack -> Send Message Executor
 * Supports both connected OAuth accounts and custom Webhook URLs.
 */
async function executeSlackSendMessage(step, context) {
  const connectionId = step.connectionId || step.config?.connectionId;
  const config = step.config?.config || step.config || {};
  const webhookUrl = resolveTemplate(context, config.webhookUrl || "");
  const text = resolveTemplate(context, config.text || config.message || "");
  const channel = resolveTemplate(context, config.channel || "").trim();

  let accessToken = config.token;

  if (connectionId) {
    const connection = await prisma.connection.findUnique({
      where: { id: connectionId },
    });
    if (connection && connection.accessToken) {
      accessToken = connection.accessToken;
    }
  }

  if (!webhookUrl && !channel) {
    throw new Error("Slack Send Message step has no channel selected. Choose a channel in the step settings.");
  }

  // Apply rate limiter before outbound request
  await slackBucket.consume();

  // 1. Direct Webhook execution if specified
  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, channel }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Slack webhook post failed (${res.status}): ${errText}`);
    }

    return { output: { status: "SENT", text, channel } };
  }

  // 2. OAuth API execution
  if (!accessToken) {
    throw new Error(`Slack step is missing connected account or OAuth token`);
  }

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ channel, text }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw slackApiError(data.error);
  }

  return { output: { status: "SENT", messageId: data.ts, channel } };
}

module.exports = executeSlackSendMessage;
