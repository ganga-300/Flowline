/**
 * Turns a failed GitHub REST response into a readable error for run history.
 * @param {Response} res
 * @param {{ action: string, repo: string, issueNumber?: number }} ctx
 */
const { retryableError } = require("../../recovery");

async function githubApiError(res, ctx) {
  const err = await describeGithubError(res, ctx);
  const tagged = retryableError(err.message, res.status);
  // A 403 caused by the rate limit means the request was rejected, so it's safe to retry.
  if (res.status === 403 && res.headers?.get?.("x-ratelimit-remaining") === "0") tagged.retryable = true;
  return tagged;
}

async function describeGithubError(res, { action, repo, issueNumber }) {
  const data = await res.json().catch(() => ({}));
  const detail = data && data.message ? `: ${data.message}` : "";
  const target = issueNumber ? `Issue #${issueNumber} in ${repo}` : `Repository ${repo}`;

  switch (res.status) {
    case 401:
      return new Error("GitHub authentication failed (401). Please reconnect GitHub in the Connections tab.");
    case 403:
      if (res.headers?.get?.("x-ratelimit-remaining") === "0") {
        return new Error("GitHub API rate limit reached (403). Try again later.");
      }
      return new Error(`GitHub denied access to ${repo} (403)${detail}. Check that the connected account has permission to write to it.`);
    case 404:
      return new Error(`${target} not found, or the connected GitHub account has no access to it (404).`);
    case 410:
      return new Error(`Issues are disabled for ${repo} (410). Enable Issues in the repository settings.`);
    default:
      return new Error(`GitHub API ${action} failed (${res.status})${detail}`);
  }
}

module.exports = { githubApiError };
