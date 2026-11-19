/**
 * Who Flowline is in a Slack workspace, so the "New Message" trigger can skip messages it
 * posted itself. Without that, a Flow that posts into the channel it watches would trigger
 * itself forever (bot-token messages have no `subtype`, so the subtype check misses them).
 *
 * auth.test is called once per token and cached for the life of the process; a failed call
 * isn't cached, so the next poll asks again.
 */
const { fetchWithTimeout } = require("../../fetchWithTimeout");
const { slackApiError } = require("./errors");

const MAX_CACHED = 500;
const cache = new Map(); // access token -> Promise<{ userId, botId }>

async function readIdentity(accessToken) {
  const res = await fetchWithTimeout("https://slack.com/api/auth.test", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!data.ok) throw slackApiError(data.error);
  return { userId: data.user_id || null, botId: data.bot_id || null };
}

/** -> { userId, botId } for the token (botId is null for a user token). Throws on Slack errors. */
function slackSelfIdentity(accessToken) {
  if (!cache.has(accessToken)) {
    if (cache.size >= MAX_CACHED) cache.clear();
    const lookup = readIdentity(accessToken);
    cache.set(accessToken, lookup);
    lookup.catch(() => cache.delete(accessToken));
  }
  return cache.get(accessToken);
}

/**
 * True for a message Flowline posted with this token. The bot user's id is only compared
 * for bot tokens: with a user token it would be a person, whose messages must still run.
 */
function isOwnSlackMessage(msg, self) {
  if (!msg || !self?.botId) return false;
  return msg.bot_id === self.botId || (Boolean(self.userId) && msg.user === self.userId);
}

/** Tests only. */
function clearSlackIdentityCache() {
  cache.clear();
}

module.exports = { slackSelfIdentity, isOwnSlackMessage, clearSlackIdentityCache };
