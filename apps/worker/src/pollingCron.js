require("dotenv").config();
const crypto = require("crypto");
const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const prisma = require("./prismaClient");
const { refreshGoogleAccessToken } = require("./integrations/google/refreshToken");

const connection = new IORedis("redis://localhost:6380", {
  maxRetriesPerRequest: null,
});

const zapExecutionQueue = new Queue("zap-execution", { connection });

const POLL_CYCLE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Parses MIME body from Gmail message payload
 */
function extractGmailBody(payload) {
  if (!payload) return "";
  if (payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body && part.body.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
      if (part.mimeType === "text/html" && part.body && part.body.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
      if (part.parts) {
        const nested = extractGmailBody(part);
        if (nested) return nested;
      }
    }
  }
  return "";
}

/**
 * Polling handler for GitHub triggers (new_issue, new_push)
 */
async function pollGitHubTrigger(trigger) {
  const repo = trigger.config?.repo || trigger.config?.repository;
  if (!repo) {
    console.log(`[polling] GitHub trigger ${trigger.id} has no repository configured, skipping`);
    return;
  }

  const cleanRepo = repo.trim().replace(/^https?:\/\/github\.com\//i, "");
  const event = trigger.config?.event || "new_issue";

  const headers = {
    "User-Agent": "Flowline-Worker",
    Accept: "application/vnd.github.v3+json",
  };

  if (trigger.connection?.accessToken) {
    headers.Authorization = `Bearer ${trigger.connection.accessToken}`;
  } else if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  if (event === "new_push") {
    // Poll for new commits
    const url = `https://api.github.com/repos/${cleanRepo}/commits?per_page=10`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.log(`[polling] GitHub commits fetch failed for ${cleanRepo}: ${res.status}`);
      return;
    }

    const commits = await res.json().catch(() => null);
    if (!Array.isArray(commits) || commits.length === 0) return;

    const latestCommit = commits[0];
    const latestSha = latestCommit.sha;

    if (!trigger.lastPollHash) {
      console.log(`[polling] GitHub trigger ${trigger.id}: established baseline at commit ${latestSha.slice(0, 7)}`);
      await prisma.trigger.update({
        where: { id: trigger.id },
        data: { lastPollHash: latestSha },
      });
      return;
    }

    if (trigger.lastPollHash === latestSha) return;

    const newCommits = [];
    for (const c of commits) {
      if (c.sha === trigger.lastPollHash) break;
      newCommits.push(c);
    }

    await prisma.trigger.update({
      where: { id: trigger.id },
      data: { lastPollHash: latestSha },
    });

    for (const commit of newCommits.reverse()) {
      const payload = {
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
        repository: {
          full_name: cleanRepo,
          name: cleanRepo.split("/")[1] || cleanRepo,
          url: `https://github.com/${cleanRepo}`,
        },
      };

      const idempotencyKey = `${trigger.id}-commit-${commit.sha}`;
      try {
        const run = await prisma.zapRun.create({
          data: {
            zapId: trigger.zapId,
            status: "QUEUED",
            idempotencyKey,
            triggerPayload: payload,
          },
        });
        await zapExecutionQueue.add("execute-zap-run", { zapRunId: run.id });
        console.log(`[polling] GitHub: queued run ${run.id} for new commit ${commit.sha.slice(0, 7)}`);
      } catch (err) {
        if (err.code !== "P2002") throw err;
      }
    }
    return;
  }

  // Default: new_issue
  const url = `https://api.github.com/repos/${cleanRepo}/issues?state=open&sort=created&direction=desc&per_page=10`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 403) {
      console.warn(`[polling] GitHub API rate limit reached for ${cleanRepo}.`);
    } else {
      console.log(`[polling] GitHub fetch failed for ${cleanRepo}: ${res.status}`);
    }
    return;
  }

  const items = await res.json().catch(() => null);
  if (!Array.isArray(items)) return;

  const issues = items.filter((item) => !item.pull_request);
  if (issues.length === 0) return;

  const latestIssue = issues[0];
  const latestIssueId = String(latestIssue.id);

  if (!trigger.lastPollHash) {
    console.log(`[polling] GitHub trigger ${trigger.id}: baseline at issue #${latestIssue.number}`);
    await prisma.trigger.update({
      where: { id: trigger.id },
      data: { lastPollHash: latestIssueId },
    });
    return;
  }

  if (trigger.lastPollHash === latestIssueId) return;

  const newIssues = [];
  for (const issue of issues) {
    if (String(issue.id) === trigger.lastPollHash) break;
    newIssues.push(issue);
  }

  await prisma.trigger.update({
    where: { id: trigger.id },
    data: { lastPollHash: latestIssueId },
  });

  for (const newIssue of newIssues.reverse()) {
    const payload = {
      action: "opened",
      issue: {
        id: newIssue.id,
        number: newIssue.number,
        title: newIssue.title,
        body: newIssue.body || "",
        html_url: newIssue.html_url,
        state: newIssue.state,
        user: {
          login: newIssue.user?.login || "anonymous",
          avatar_url: newIssue.user?.avatar_url,
          html_url: newIssue.user?.html_url,
        },
        created_at: newIssue.created_at,
      },
      repository: {
        full_name: cleanRepo,
        name: cleanRepo.split("/")[1] || cleanRepo,
        owner: { login: cleanRepo.split("/")[0] || "" },
        html_url: `https://github.com/${cleanRepo}`,
      },
    };

    const idempotencyKey = `${trigger.id}-issue-${newIssue.id}`;
    try {
      const run = await prisma.zapRun.create({
        data: {
          zapId: trigger.zapId,
          status: "QUEUED",
          idempotencyKey,
          triggerPayload: payload,
        },
      });
      await zapExecutionQueue.add("execute-zap-run", { zapRunId: run.id });
      console.log(`[polling] GitHub: queued run ${run.id} for new issue #${newIssue.number}`);
    } catch (err) {
      if (err.code !== "P2002") throw err;
    }
  }
}

/**
 * Polling handler for Gmail triggers (new_email)
 */
async function pollGmailTrigger(trigger) {
  if (!trigger.connection) {
    console.log(`[polling] Gmail trigger ${trigger.id} has no connected account, skipping`);
    return;
  }

  let accessToken = trigger.connection.accessToken;
  const query = trigger.config?.query || trigger.config?.q || "is:unread";
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(query)}`;

  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401 && trigger.connection.refreshToken) {
    console.log(`[polling] Gmail token expired for trigger ${trigger.id}. Refreshing...`);
    try {
      accessToken = await refreshGoogleAccessToken(trigger.connection.id, trigger.connection.refreshToken);
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (refreshErr) {
      console.error(`[polling] Gmail refresh failed for trigger ${trigger.id}:`, refreshErr.message);
      return;
    }
  }

  if (!res.ok) {
    console.log(`[polling] Gmail messages list failed for trigger ${trigger.id}: ${res.status}`);
    return;
  }

  const listData = await res.json().catch(() => ({}));
  const messages = listData.messages || [];
  if (messages.length === 0) return;

  const latestMessageId = messages[0].id;

  if (!trigger.lastPollHash) {
    console.log(`[polling] Gmail trigger ${trigger.id}: baseline at message ${latestMessageId}`);
    await prisma.trigger.update({
      where: { id: trigger.id },
      data: { lastPollHash: latestMessageId },
    });
    return;
  }

  if (trigger.lastPollHash === latestMessageId) return;

  const newMessages = [];
  for (const m of messages) {
    if (m.id === trigger.lastPollHash) break;
    newMessages.push(m);
  }

  await prisma.trigger.update({
    where: { id: trigger.id },
    data: { lastPollHash: latestMessageId },
  });

  for (const msgSummary of newMessages.reverse()) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgSummary.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!msgRes.ok) continue;

      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      const headerMap = {};
      for (const h of headers) {
        headerMap[h.name.toLowerCase()] = h.value;
      }

      const bodyContent = extractGmailBody(msgData.payload);

      const payload = {
        email: {
          id: msgData.id,
          threadId: msgData.threadId,
          from: headerMap["from"] || "",
          to: headerMap["to"] || "",
          subject: headerMap["subject"] || "",
          date: headerMap["date"] || "",
          snippet: msgData.snippet || "",
          body: bodyContent || msgData.snippet || "",
        },
      };

      const idempotencyKey = `${trigger.id}-gmail-${msgData.id}`;
      const run = await prisma.zapRun.create({
        data: {
          zapId: trigger.zapId,
          status: "QUEUED",
          idempotencyKey,
          triggerPayload: payload,
        },
      });

      await zapExecutionQueue.add("execute-zap-run", { zapRunId: run.id });
      console.log(`[polling] Gmail: queued run ${run.id} for message "${headerMap["subject"] || msgData.id}"`);
    } catch (err) {
      if (err.code !== "P2002") {
        console.error(`[polling] Error processing Gmail message ${msgSummary.id}:`, err.message);
      }
    }
  }
}

/**
 * Polling handler for Slack triggers (new_message)
 */
async function pollSlackTrigger(trigger) {
  if (!trigger.connection) {
    console.log(`[polling] Slack trigger ${trigger.id} has no connected account, skipping`);
    return;
  }

  const accessToken = trigger.connection.accessToken;
  let channelId = trigger.config?.channel || trigger.config?.channelId || "general";

  // If channel is like #general, lookup channel ID
  if (channelId.startsWith("#")) {
    const listRes = await fetch("https://slack.com/api/conversations.list?types=public_channel,private_channel", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const listData = await listRes.json().catch(() => ({}));
    if (listData.ok && Array.isArray(listData.channels)) {
      const match = listData.channels.find((c) => `#${c.name}` === channelId || c.name === channelId.replace("#", ""));
      if (match) channelId = match.id;
    }
  }

  const url = `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channelId)}&limit=10`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    console.log(`[polling] Slack conversations.history failed: ${res.status}`);
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (!data.ok || !Array.isArray(data.messages) || data.messages.length === 0) return;

  const validMessages = data.messages.filter((m) => m.type === "message" && !m.subtype);
  if (validMessages.length === 0) return;

  const latestMsg = validMessages[0];
  const latestTs = latestMsg.ts;

  if (!trigger.lastPollHash) {
    console.log(`[polling] Slack trigger ${trigger.id}: baseline at ts ${latestTs}`);
    await prisma.trigger.update({
      where: { id: trigger.id },
      data: { lastPollHash: latestTs },
    });
    return;
  }

  if (trigger.lastPollHash === latestTs) return;

  const newMessages = [];
  for (const m of validMessages) {
    if (m.ts === trigger.lastPollHash || parseFloat(m.ts) <= parseFloat(trigger.lastPollHash)) break;
    newMessages.push(m);
  }

  await prisma.trigger.update({
    where: { id: trigger.id },
    data: { lastPollHash: latestTs },
  });

  for (const msg of newMessages.reverse()) {
    const payload = {
      message: {
        text: msg.text || "",
        user: msg.user || "unknown",
        ts: msg.ts,
        channel: channelId,
      },
    };

    const idempotencyKey = `${trigger.id}-slack-${msg.ts}`;
    try {
      const run = await prisma.zapRun.create({
        data: {
          zapId: trigger.zapId,
          status: "QUEUED",
          idempotencyKey,
          triggerPayload: payload,
        },
      });

      await zapExecutionQueue.add("execute-zap-run", { zapRunId: run.id });
      console.log(`[polling] Slack: queued run ${run.id} for new message`);
    } catch (err) {
      if (err.code !== "P2002") throw err;
    }
  }
}

/**
 * Fetches all active POLLING triggers, executes API checks for supported integrations,
 * hashes the response, and queues a ZapRun if new data is detected.
 */
async function runPollingCycle() {
  console.log("[polling] Starting polling cycle...");

  const triggers = await prisma.trigger.findMany({
    where: {
      type: "POLLING",
      zap: { status: "ENABLED" },
    },
    include: { zap: true, connection: true },
  });

  console.log(`[polling] Found ${triggers.length} active polling trigger(s)`);

  for (const trigger of triggers) {
    try {
      const provider = trigger.config?.provider || "";

      // 1. GitHub Integration (new_issue, new_push)
      if (provider === "github") {
        await pollGitHubTrigger(trigger);
        continue;
      }

      // 2. Gmail Integration (new_email)
      if (provider === "gmail") {
        await pollGmailTrigger(trigger);
        continue;
      }

      // 3. Slack Integration (new_message)
      if (provider === "slack") {
        await pollSlackTrigger(trigger);
        continue;
      }



      // 5. Generic HTTP polling fallback
      const url = trigger.config?.url;
      if (!url) continue;

      const headers = trigger.config?.headers || {};
      const res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json", ...headers },
      });

      if (!res.ok) {
        console.log(`[polling] Trigger ${trigger.id} fetch failed: ${res.status}`);
        continue;
      }

      const data = await res.json();
      if (!data) continue;

      const dataStr = JSON.stringify(data);
      const hash = crypto.createHash("sha256").update(dataStr).digest("hex");

      if (hash === trigger.lastPollHash) continue;

      await prisma.trigger.update({
        where: { id: trigger.id },
        data: { lastPollHash: hash },
      });

      const idempotencyKey = `${trigger.id}-poll-${hash}`;
      try {
        const run = await prisma.zapRun.create({
          data: {
            zapId: trigger.zapId,
            status: "QUEUED",
            idempotencyKey,
            triggerPayload: data,
          },
        });
        await zapExecutionQueue.add("execute-zap-run", { zapRunId: run.id });
        console.log(`[polling] HTTP Trigger ${trigger.id}: new data detected, queued run ${run.id}`);
      } catch (err) {
        if (err.code !== "P2002") throw err;
      }
    } catch (err) {
      console.error(`[polling] Error processing trigger ${trigger.id}:`, err.message);
    }
  }

  console.log("[polling] Cycle complete");
}

async function start() {
  console.log("[polling] Polling cron engine started (interval: 5 min)");

  while (true) {
    try {
      await runPollingCycle();
    } catch (err) {
      console.error("[polling] Unhandled error in polling cycle:", err.message);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS));
  }
}

start();
