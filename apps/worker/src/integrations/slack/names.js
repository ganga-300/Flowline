/**
 * Resolves Slack user and channel ids to readable names for the trigger payload
 * (message.user_name, message.channel_name). Uses users:read / channels:read, which the
 * Slack connection already has. Failures fall back to the id - a missing name must
 * never fail a run. One resolver per poll caches lookups.
 */
function createSlackNameResolver(accessToken) {
  const userCache = new Map();
  const channelCache = new Map();

  async function callSlack(method, params) {
    try {
      const res = await fetch(`https://slack.com/api/${method}?${new URLSearchParams(params)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      return data && data.ok ? data : null;
    } catch {
      return null;
    }
  }

  function userName(userId) {
    if (!userId) return Promise.resolve("");
    if (!userCache.has(userId)) {
      userCache.set(userId, callSlack("users.info", { user: userId }).then((data) => {
        const u = data?.user;
        return u?.profile?.display_name || u?.profile?.real_name || u?.real_name || u?.name || userId;
      }));
    }
    return userCache.get(userId);
  }

  function channelName(channelId) {
    if (!channelId) return Promise.resolve("");
    if (!channelCache.has(channelId)) {
      channelCache.set(channelId, callSlack("conversations.info", { channel: channelId }).then((data) => data?.channel?.name || channelId));
    }
    return channelCache.get(channelId);
  }

  return { userName, channelName };
}

module.exports = { createSlackNameResolver };
