/**
 * Trigger payload builders - the single source of truth for what `{{trigger.*}}`
 * contains. Used by BOTH the polling engine (real runs) and the builder's
 * "Fetch latest" sample (/zaps/test-step/fetch-sample), so a variable that
 * resolves while testing a step also resolves in a real run.
 *
 * Shapes (what users reference as {{trigger.<path>}}):
 *   GitHub new_issue  -> { action, issue: {...}, repository: {...} }
 *   GitHub new_push   -> { action, commit: {...}, repository: {...} }
 *   Gmail new_email   -> { email: {...} }
 *   Slack new_message -> { message: {...} }
 */

function cleanRepoName(repo) {
  return String(repo || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/+$/, "");
}

function repositoryInfo(repo) {
  const fullName = cleanRepoName(repo);
  const [owner = "", name = ""] = fullName.split("/");
  return {
    full_name: fullName,
    name: name || fullName,
    owner: { login: owner },
    html_url: `https://github.com/${fullName}`,
  };
}

/** @param issue - item from GET /repos/{repo}/issues */
function githubIssuePayload(issue, repo) {
  return {
    action: "opened",
    issue: {
      id: issue.id,
      number: issue.number,
      title: issue.title || "",
      body: issue.body || "",
      html_url: issue.html_url,
      state: issue.state,
      user: {
        login: issue.user?.login || "anonymous",
        avatar_url: issue.user?.avatar_url,
        html_url: issue.user?.html_url,
      },
      created_at: issue.created_at,
    },
    repository: repositoryInfo(repo),
  };
}

/** @param commit - item from GET /repos/{repo}/commits */
function githubCommitPayload(commit, repo) {
  const repository = repositoryInfo(repo);
  return {
    action: "push",
    commit: {
      sha: commit.sha,
      message: commit.commit?.message || "",
      author: {
        name: commit.commit?.author?.name || "anonymous",
        email: commit.commit?.author?.email || "",
        date: commit.commit?.author?.date || "",
      },
      html_url: commit.html_url,
    },
    // `url` kept for backward compatibility with payloads stored by earlier runs.
    repository: { ...repository, url: repository.html_url },
  };
}

function decodeBase64Url(data) {
  return Buffer.from(String(data).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

/** Extracts the body from a Gmail message payload, preferring text/plain over text/html. */
function extractGmailBody(payload) {
  if (!payload) return "";
  if (payload.body && payload.body.data && !Array.isArray(payload.parts)) {
    return decodeBase64Url(payload.body.data);
  }
  if (Array.isArray(payload.parts)) {
    const plain = payload.parts.find((p) => p.mimeType === "text/plain" && p.body?.data);
    if (plain) return decodeBase64Url(plain.body.data);
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractGmailBody(part);
        if (nested) return nested;
      }
    }
    const html = payload.parts.find((p) => p.mimeType === "text/html" && p.body?.data);
    if (html) return decodeBase64Url(html.body.data);
  }
  if (payload.body && payload.body.data) return decodeBase64Url(payload.body.data);
  return "";
}

/** @param msg - response of GET /gmail/v1/users/me/messages/{id}?format=full */
function gmailMessagePayload(msg) {
  const headerMap = {};
  for (const h of msg.payload?.headers || []) {
    headerMap[h.name.toLowerCase()] = h.value;
  }
  const body = extractGmailBody(msg.payload);
  return {
    email: {
      id: msg.id,
      threadId: msg.threadId,
      from: headerMap["from"] || "",
      to: headerMap["to"] || "",
      subject: headerMap["subject"] || "",
      date: headerMap["date"] || "",
      snippet: msg.snippet || "",
      body: body || msg.snippet || "",
    },
  };
}

/** @param msg - item from conversations.history */
function slackMessagePayload(msg, channelId) {
  return {
    message: {
      text: msg.text || "",
      user: msg.user || "unknown",
      ts: msg.ts,
      channel: channelId,
    },
  };
}

module.exports = {
  cleanRepoName,
  githubIssuePayload,
  githubCommitPayload,
  gmailMessagePayload,
  slackMessagePayload,
  extractGmailBody,
};
