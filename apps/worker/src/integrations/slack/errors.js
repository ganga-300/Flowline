/** Plain-language messages for Slack Web API error codes, shown in run history. */
function describeSlackError(code) {
  switch (code) {
    case "not_in_channel":
      return "Flowline isn't a member of this Slack channel (not_in_channel). In Slack, open the channel and run /invite @Flowline (your app's name).";
    case "channel_not_found":
      return "Slack channel not found (channel_not_found). It may have been deleted, or Flowline can't see it.";
    case "is_archived":
      return "This Slack channel is archived (is_archived).";
    case "invalid_auth":
    case "token_revoked":
    case "account_inactive":
      return `Slack authorization failed (${code}). Please reconnect Slack in the Connections tab.`;
    case "missing_scope":
      return "Slack connection is missing a permission (missing_scope). Please reconnect Slack in the Connections tab.";
    case "ratelimited":
      return "Slack rate limit reached (ratelimited).";
    case "no_text":
      return "Slack message text is empty (no_text).";
    default:
      return `Slack API error: ${code}`;
  }
}

/** Error for a failed Slack call; only "ratelimited" (request rejected) is safe to retry. */
function slackApiError(code) {
  const err = new Error(describeSlackError(code));
  err.slackError = code;
  err.retryable = code === "ratelimited";
  return err;
}

module.exports = { describeSlackError, slackApiError };
