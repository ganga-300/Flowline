const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// Login tokens and OAuth `state` values are both JWTs signed with JWT_SECRET, so each carries
// a `typ` and is accepted only where that type is expected. A state value passes through the
// provider's authorize URL and must never work as a login token (or a login token as state).
const SESSION = "session";
const OAUTH_STATE = "oauth_state";

function signSessionToken(userId) {
  return jwt.sign({ userId, typ: SESSION }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

/** Returns the decoded login token; throws if it is invalid, expired or not a login token. */
function verifySessionToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  // Login tokens issued before `typ` existed have neither `typ` nor `provider` (old state
  // values had `provider`); they expire on their own within 7 days.
  const legacySession = decoded.typ === undefined && decoded.provider === undefined;
  if (decoded.typ !== SESSION && !legacySession) throw new Error("Not a login token");
  return decoded;
}

function signOAuthState({ userId, provider, returnUrl }) {
  return jwt.sign(
    { userId, provider, returnUrl: safeReturnUrl(returnUrl), nonce: crypto.randomBytes(16).toString("hex"), typ: OAUTH_STATE },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
}

/** Returns the decoded state; throws unless it is a valid state issued for this provider. */
function verifyOAuthState(state, provider) {
  const decoded = jwt.verify(state, process.env.JWT_SECRET);
  if (decoded.typ !== OAUTH_STATE || decoded.provider !== provider) throw new Error("Not an OAuth state for this app");
  return decoded;
}

/**
 * Where to send the user after connecting an app: a path on the frontend, which callbacks
 * append to the frontend origin. Anything else (`//host`, `/\host`, `@host`, control
 * characters, which browsers strip) could point at another site, so it becomes "/connections".
 */
function safeReturnUrl(value) {
  const ok = typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !/[\\\x00-\x1f\x7f]/.test(value);
  return ok ? value : "/connections";
}

module.exports = { signSessionToken, verifySessionToken, signOAuthState, verifyOAuthState, safeReturnUrl };
