/**
 * fetch() with a time limit, for every call to GitHub, Slack, Gmail/Google and OpenRouter.
 * Without one, a provider that never answers holds the worker (concurrency 1) or the
 * polling cycle for minutes. Used by the worker and by the server's routes.
 *
 * A timeout is NOT retryable (err.retryable = false, see recovery.js): the request may
 * already have reached the provider, so re-sending could duplicate a message/email/issue.
 * The step fails with a clear message and the user can use "Retry run".
 * The limit covers the whole response, including reading the body.
 */
const REQUEST_TIMEOUT_MS = 15_000;

function timeoutError(url, timeoutMs, cause) {
  let host = "the provider";
  try {
    host = new URL(url).host; // host only: query strings can carry tokens
  } catch {
    // keep the generic name
  }
  const err = new Error(`Request to ${host} timed out after ${timeoutMs / 1000}s.`, { cause });
  err.timedOut = true;
  err.retryable = false;
  return err;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  try {
    return await fetch(url, { ...options, signal: options.signal ?? AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err && err.name === "TimeoutError") throw timeoutError(String(url), timeoutMs, err);
    throw err;
  }
}

module.exports = { fetchWithTimeout, REQUEST_TIMEOUT_MS };
