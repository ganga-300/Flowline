/**
 * The API answers in JSON, also when something goes wrong. Express's defaults are HTML pages
 * (with a stack trace outside production) - unreadable for the web app and for webhook
 * senders, and they leak file paths.
 */

function notFoundHandler(req, res) {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.path}` });
}

// Express recognises an error handler by its four parameters, so `next` must stay.
// eslint-disable-next-line no-unused-vars
function jsonErrorHandler(err, req, res, next) {
  // Body-parser errors carry the HTTP status and a `type`.
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "The request body isn't valid JSON." });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "The request body is too large." });
  }
  const status = Number(err?.status || err?.statusCode);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: err.expose && err.message ? err.message : "Bad request." });
  }
  console.error(`[api] ${req.method} ${req.originalUrl || req.url} failed:`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong on the Flowline server. Please try again." });
}

module.exports = { notFoundHandler, jsonErrorHandler };
