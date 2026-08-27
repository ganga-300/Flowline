const { resolveTemplate } = require("../../conditions");

/**
 * Slack -> Send Message Executor
 * Sends a message via Slack incoming webhook or Bot OAuth token.
 */
async function executeSlackSendMessage(step, context) {
  const config = step.config?.config || step.config || {};
  const webhookUrl = resolveTemplate(context, config.webhookUrl || "");
  const text = resolveTemplate(context, config.text || config.message || "");
  const channel = resolveTemplate(context, config.channel || "#general");

  if (!webhookUrl && !config.token) {
    throw new Error(`Slack step ${step.id} missing webhookUrl or OAuth token`);
  }

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

  // OAuth token post
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({ channel, text }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  return { output: { status: "SENT", messageId: data.ts, channel } };
}

module.exports = executeSlackSendMessage;
