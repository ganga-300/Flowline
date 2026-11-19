/**
 * Shared by the OAuth /start routes (GitHub, Gmail, Slack). The browser opens these as a
 * full-page navigation, so a JSON error would strand the user on a raw API page: every
 * problem redirects back to the page they came from with ?error=, which the Apps page and
 * the builder show.
 */
const { allowedOrigins } = require("../config");
const { safeReturnUrl } = require("./authTokens");
const { sessionUserId } = require("./session");

/** The frontend URL for `returnUrl` (any unsafe value becomes /connections) with query params added. */
function frontendUrl(returnUrl, params) {
  const path = safeReturnUrl(returnUrl);
  const query = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return `${allowedOrigins()[0]}${path}${path.includes("?") ? "&" : "?"}${query}`;
}

function redirectWithError(res, returnUrl, message) {
  return res.redirect(frontendUrl(returnUrl, { error: message }));
}

/** Like requireAuth, but the session token may come in ?token= and failures redirect back. */
async function oauthStartAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.query.token;
  if (!token) return redirectWithError(res, req.query.returnUrl, "Sign in to Flowline first, then connect the app.");
  try {
    req.userId = await sessionUserId(token);
  } catch (err) {
    if (!err.sessionEnded) return next(err);
    return redirectWithError(res, req.query.returnUrl, "Your Flowline session has expired. Sign in again, then connect the app.");
  }
  next();
}

/** The message when the server has no OAuth app configured for a provider. */
function notConfiguredMessage(appName, missing) {
  return `Connecting ${appName} isn't set up on this Flowline server yet (${missing.join(" and ")} missing). Ask the admin to add it.`;
}

module.exports = { frontendUrl, redirectWithError, oauthStartAuth, notConfiguredMessage };
