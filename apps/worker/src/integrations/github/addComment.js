const prisma = require("../../prismaClient");
const { resolveTemplate } = require("../../conditions");
const { cleanRepoName } = require("../triggerPayloads");
const { githubApiError } = require("./errors");

/**
 * GitHub -> Add Comment Executor
 * Adds a comment to an issue or pull request.
 * 
 * @param {Object} step
 * @param {Object} context
 * @returns {Promise<{ output: Object }>}
 */
async function executeGitHubAddComment(step, context) {
  const connectionId = step.connectionId || step.config?.connectionId;

  if (!connectionId) {
    throw new Error(`GitHub step ${step.id} is missing connectionId`);
  }

  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
  });

  if (!connection) {
    throw new Error(`Connection ${connectionId} not found for GitHub step`);
  }

  const actionConfig = step.config?.config || step.config || {};
  const repo = cleanRepoName(resolveTemplate(context, actionConfig.repo || ""));
  const rawIssueNumber = resolveTemplate(context, String(actionConfig.issueNumber || actionConfig.issue_number || ""));
  const body = resolveTemplate(context, actionConfig.body || actionConfig.comment || "");

  // Accept "7", "#7" or " 7 " (e.g. typed by hand or from a template).
  const issueNumber = parseInt(rawIssueNumber.trim().replace(/^#/, ""), 10);

  if (!repo || isNaN(issueNumber)) {
    throw new Error("GitHub repository (owner/repo) and valid Issue Number are required");
  }

  if (!body) {
    throw new Error("Comment body is required");
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${connection.accessToken}`,
      "User-Agent": "Flowline-App",
      Accept: "application/vnd.github.v3+json",
    },
    body: JSON.stringify({ body }),
  });

  if (!res.ok) {
    throw await githubApiError(res, { action: "add comment", repo, issueNumber });
  }

  const data = await res.json();

  return {
    output: {
      status: "COMMENTED",
      commentId: data.id,
      commentUrl: data.html_url,
      repository: repo,
      issueNumber,
    },
  };
}

module.exports = executeGitHubAddComment;
