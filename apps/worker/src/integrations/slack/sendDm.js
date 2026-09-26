const prisma = require("../../prismaClient");
const { resolveTemplate } = require("../../conditions");
const TokenBucket = require("../../rateLimiter");

// Slack rate limiter: 5 messages burst capacity, 1 msg/sec refill rate
const slackBucket = new TokenBucket(5, 1);

/**
 * Slack -> Send Direct Message (DM) Executor
 * Posts a private message to a specific user by user ID or email.
 */
async function executeSlackSendDm(step, context) {
  const connectionId = step.connectionId || step.config?.connectionId;
  const config = step.config?.config || step.config || {};
  const userId = resolveTemplate(context, config.userId || config.user || "");
  const text = resolveTemplate(context, config.text || config.message || "");

  if (!userId) {
    throw new Error("Slack Send DM step is missing recipient user ID or email");
  }

  let accessToken = config.token;

  if (connectionId) {
    const connection = await prisma.connection.findUnique({
      where: { id: connectionId },
    });
    if (connection && connection.accessToken) {
      accessToken = connection.accessToken;
    }
  }

  if (!accessToken) {
    throw new Error("Slack step is missing connected account or OAuth token");
  }

  // Apply rate limiter
  await slackBucket.consume();

  let targetChannelId = userId;

  // If input looks like an email address, lookup the user ID via users.lookupByEmail
  if (userId.includes("@")) {
    const lookupRes = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const lookupData = await lookupRes.json();
    if (lookupData.ok && lookupData.user?.id) {
      targetChannelId = lookupData.user.id;
    } else {
      throw new Error(`Slack user not found for email "${userId}": ${lookupData.error || "unknown error"}`);
    }
  }

  // Open / find conversation ID for DM
  const openRes = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ users: targetChannelId }),
  });

  const openData = await openRes.json();
  const channelId = openData.ok && openData.channel?.id ? openData.channel.id : targetChannelId;

  // Post message to the DM channel
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ channel: channelId, text }),
  });

  const data = await res.json();
  if (!data.ok) {
    if (data.error === "token_revoked" || data.error === "invalid_auth") {
      throw new Error(`Slack authorization failed (${data.error}). Please reconnect Slack in the Connections tab.`);
    }
    throw new Error(`Slack API error: ${data.error}`);
  }

  return {
    output: {
      status: "SENT",
      messageId: data.ts,
      recipient: userId,
      channelId,
    },
  };
}

module.exports = executeSlackSendDm;
