// Limits password guessing: after MAX_FAILURES wrong passwords for an email within WINDOW_MS,
// logins for that email are refused until the window ends. Kept in memory (one API process).
// Keyed by email rather than IP: behind Render's proxy every request carries the proxy's IP
// unless `trust proxy` is configured, so an IP limit would lock out everyone at once.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED = 10_000;

const failures = new Map(); // email -> { count, resetAt }

function current(email, now) {
  const entry = failures.get(email);
  if (entry && entry.resetAt <= now) {
    failures.delete(email);
    return null;
  }
  return entry || null;
}

/** Seconds until this email may try again, or 0 if it isn't locked. */
function lockedForSeconds(email, now = Date.now()) {
  const entry = current(email, now);
  return entry && entry.count >= MAX_FAILURES ? Math.ceil((entry.resetAt - now) / 1000) : 0;
}

function recordFailure(email, now = Date.now()) {
  if (failures.size >= MAX_TRACKED) {
    for (const [key, entry] of failures) if (entry.resetAt <= now) failures.delete(key);
  }
  const entry = current(email, now) || { count: 0, resetAt: now + WINDOW_MS };
  entry.count += 1;
  failures.set(email, entry);
}

function clearFailures(email) {
  failures.delete(email);
}

module.exports = { lockedForSeconds, recordFailure, clearFailures, MAX_FAILURES, WINDOW_MS };
