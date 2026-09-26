const prisma = require("../../prismaClient");
const { resolveTemplate } = require("../../conditions");

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
  const repo = resolveTemplate(context, actionConfig.repo || "").trim().replace(/^https?:\/\/github\.com\//i, "");
  const rawIssueNumber = resolveTemplate(context, String(actionConfig.issueNumber || actionConfig.issue_number || ""));
  const body = resolveTemplate(context, actionConfig.body || actionConfig.comment || "");

  const issueNumber = parseInt(rawIssueNumber, 10);

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
    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.message || res.statusText || `HTTP ${res.status}`;
    if (res.status === 401) {
      throw new Error(`GitHub authentication failed. Please reconnect GitHub in the Connections tab.`);
    }
    throw new Error(`GitHub API add comment failed (${res.status}): ${errMsg}`);
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
