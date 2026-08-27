const { resolveTemplate } = require("../../conditions");

/**
 * Discord -> Send Message Executor
 * Sends a webhook message to a Discord channel.
 */
async function executeDiscordSendMessage(step, context) {
  const config = step.config?.config || step.config || {};
  const webhookUrl = resolveTemplate(context, config.webhookUrl || "");
  const content = resolveTemplate(context, config.content || config.message || "");
  const username = resolveTemplate(context, config.username || "Flowline Bot");

  if (!webhookUrl) {
    throw new Error(`Discord step ${step.id} missing webhookUrl`);
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, username }),
  });

  if (!res.ok && res.status !== 204) {
    const errText = await res.text();
    throw new Error(`Discord webhook message failed (${res.status}): ${errText}`);
  }

  return { output: { status: "SENT", content, username } };
}

module.exports = executeDiscordSendMessage;
