/**
 * Reads recent messages from a Slack channel for the "New Message in Channel" trigger.
 * Slack only returns history for channels the app is a member of, so on
 * `not_in_channel` we join public channels automatically and retry once.
 * Private channels can't be joined by an app - the user must /invite it.
 */

const { describeSlackError } = require("./errors");

async function fetchChannelHistory(accessToken, channelId, { limit = 10 } = {}) {
  const read = async () => {
    const res = await fetch(
      `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channelId)}&limit=${limit}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  };

  let data = await read();

  if (!data.ok && data.error === "not_in_channel") {
    const joinRes = await fetch("https://slack.com/api/conversations.join", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ channel: channelId }),
    });
    const join = await joinRes.json().catch(() => ({ ok: false, error: `HTTP ${joinRes.status}` }));

    if (!join.ok) {
      if (join.error === "missing_scope") {
        throw new Error("Flowline isn't in this Slack channel and can't join it yet. Reconnect Slack in the Connections tab to grant the new 'join channels' permission, or /invite the Flowline app to the channel.");
      }
      if (join.error === "method_not_supported_for_channel_type" || join.error === "is_archived") {
        throw new Error("Flowline isn't a member of this private channel. In Slack, open the channel and run /invite @Flowline (your app's name).");
      }
      throw new Error(`Flowline couldn't join this Slack channel (${join.error}). In Slack, run /invite @Flowline in the channel.`);
    }
    data = await read();
  }

  if (!data.ok) {
    throw new Error(describeSlackError(data.error));
  }
  return Array.isArray(data.messages) ? data.messages : [];
}

module.exports = { fetchChannelHistory };
