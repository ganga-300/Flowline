/**
 * Which errors mean "the app rejected this account's token" (revoked, expired, app
 * uninstalled) - as opposed to rate limits, outages or bad input. Pure; shared by the
 * worker (connectionHealth.js) and the API (routes/options.js).
 */

// Slack Web API codes that mean the token itself is no longer accepted.
const SLACK_AUTH_CODES = new Set(["invalid_auth", "not_authed", "token_revoked", "token_expired", "account_inactive"]);

function isAuthFailure(err) {
  if (!err) return false;
  if (err.authFailed === true) return true;
  if (err.status === 401) return true;
  return SLACK_AUTH_CODES.has(err.slackError);
}

module.exports = { SLACK_AUTH_CODES, isAuthFailure };
