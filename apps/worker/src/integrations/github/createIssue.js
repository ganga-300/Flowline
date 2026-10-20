const prisma = require("../../prismaClient");
const { resolveTemplate } = require("../../conditions");
const { cleanRepoName } = require("../triggerPayloads");
const { githubApiError } = require("./errors");

/**
 * GitHub -> Create Issue Executor
 * @param {Object} step
 * @param {Object} context
 * @returns {Promise<{ output: Object }>}
 */
async function executeGitHubCreateIssue(step, context) {
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
  const title = resolveTemplate(context, actionConfig.title || "").trim();
  const body = resolveTemplate(context, actionConfig.body || "");

  if (!repo || !title) {
    throw new Error("GitHub repository (owner/repo) and Issue Title are required");
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${connection.accessToken}`,
      "User-Agent": "Flowline-App",
      Accept: "application/vnd.github.v3+json",
    },
    body: JSON.stringify({
      title,
      body,
    }),
  });

  if (!res.ok) {
    throw await githubApiError(res, { action: "create issue", repo });
  }

  const data = await res.json();

  return {
    output: {
      status: "CREATED",
      issueNumber: data.number,
      issueUrl: data.html_url,
      title: data.title,
      repository: repo,
    },
  };
}

module.exports = executeGitHubCreateIssue;
