/**
 * Reads messages from a Slack channel for the "New Message in Channel" trigger.
 * Slack only returns history for channels the app is a member of, so on
 * `not_in_channel` we join public channels automatically and retry once.
 * Private channels can't be joined by an app - the user must /invite it.
 *
 *  - fetchChannelHistory: the latest messages (one page) - for samples and the first check.
 *  - fetchChannelHistorySince: EVERY message newer than a checkpoint ts, across pages -
 *    for polling, so a burst of messages between two checks is never cut off.
 */

const { describeSlackError } = require("./errors");
const { fetchWithTimeout } = require("../../fetchWithTimeout");

const PAGE_LIMIT = 200; // Slack's recommended page size for conversations.history
const MAX_PAGES = 20;

async function joinChannel(accessToken, channelId) {
  const joinRes = await fetchWithTimeout("https://slack.com/api/conversations.join", {
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
}

/** One conversations.history call (joining the channel first if needed). Throws on errors. */
async function readHistoryPage(accessToken, channelId, params) {
  const read = async () => {
    const query = new URLSearchParams({ channel: channelId, ...params });
    const res = await fetchWithTimeout(`https://slack.com/api/conversations.history?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  };

  let data = await read();
  if (!data.ok && data.error === "not_in_channel") {
    await joinChannel(accessToken, channelId);
    data = await read();
  }
  if (!data.ok) {
    throw new Error(describeSlackError(data.error));
  }
  return data;
}

async function fetchChannelHistory(accessToken, channelId, { limit = 10 } = {}) {
  const data = await readHistoryPage(accessToken, channelId, { limit: String(limit) });
  return Array.isArray(data.messages) ? data.messages : [];
}

/**
 * All messages with ts strictly after `oldest`, newest first (Slack's order), following
 * next_cursor until Slack says there are no more. Throws - so the caller keeps its
 * checkpoint - if any page fails or the backlog is longer than MAX_PAGES pages.
 */
async function fetchChannelHistorySince(accessToken, channelId, oldest, { pageLimit = PAGE_LIMIT, maxPages = MAX_PAGES } = {}) {
  const messages = [];
  let cursor;
  for (let page = 1; ; page++) {
    const params = { oldest: String(oldest), inclusive: "false", limit: String(pageLimit) };
    if (cursor) params.cursor = cursor;
    const data = await readHistoryPage(accessToken, channelId, params);
    if (Array.isArray(data.messages)) messages.push(...data.messages);

    cursor = data.response_metadata?.next_cursor;
    if (!data.has_more || !cursor) return messages;
    if (page >= maxPages) {
      throw new Error(`More than ${maxPages} pages of new Slack messages since the last check; not processed this time so none are skipped.`);
    }
  }
}

module.exports = { fetchChannelHistory, fetchChannelHistorySince, PAGE_LIMIT, MAX_PAGES };
