const { sessionUserId } = require("../lib/session");

/** Requires a valid, current login token (Authorization: Bearer <token>); sets req.userId. */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Log in to continue." });
  }
  try {
    req.userId = await sessionUserId(authHeader.slice(7));
  } catch (err) {
    if (err.sessionEnded) return res.status(401).json({ error: err.message });
    return next(err); // database down: the error handler answers 500
  }
  next();
}

module.exports = requireAuth;
