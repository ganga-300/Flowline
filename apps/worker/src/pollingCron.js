require("dotenv").config();
const crypto = require("crypto");
const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const { redisUrl } = require("../../server/src/config");
const prisma = require("./prismaClient");
const { refreshGoogleAccessToken } = require("./integrations/google/refreshToken");
const {
  githubIssuePayload,
  githubCommitPayload,
  gmailMessagePayload,
  slackMessagePayload,
} = require("./integrations/triggerPayloads");
const { fetchChannelHistory } = require("./integrations/slack/channelHistory");
const { createSlackNameResolver } = require("./integrations/slack/names");
const { createAndQueueRun } = require("./runQueue");

const connection = new IORedis(redisUrl(), {
  maxRetriesPerRequest: null,
});

const zapExecutionQueue = new Queue("zap-execution", { connection });

const POLL_CYCLE_MS = 5 * 60 * 1000; // 5 minutes

// Records that `marker` (an item id) has a run. Called only AFTER the run for that item
// is saved and queued, so a crash can never skip an item: the next poll starts after the
// last item that really has a run, and createAndQueueRun dedupes anything redone.
async function advanceMarker(trigger, marker) {
  await prisma.trigger.update({ where: { id: trigger.id }, data: { lastPollHash: marker } });
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

    // Oldest first; the marker moves only after each commit's run is saved and queued.
    for (const commit of newCommits.reverse()) {
      const { run, created } = await createAndQueueRun(prisma, zapExecutionQueue, {
        zapId: trigger.zapId,
        idempotencyKey: `${trigger.id}-commit-${commit.sha}`,
        triggerPayload: githubCommitPayload(commit, cleanRepo),
      });
      if (created) console.log(`[polling] GitHub: queued run ${run.id} for new commit ${commit.sha.slice(0, 7)}`);
      await advanceMarker(trigger, commit.sha);
    }
    return;
  }

  // Default: new_issue
  const PER_PAGE = 100;
  const MAX_PAGES = 5;
  const newIssues = [];
  let latestIssueId = null;
  let page = 1;
  let foundCursor = false;

  while (page <= MAX_PAGES) {
    const url = `https://api.github.com/repos/${cleanRepo}/issues?state=all&sort=created&direction=desc&per_page=${PER_PAGE}&page=${page}`;
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
    if (!Array.isArray(items) || items.length === 0) break;

    const issues = items.filter((item) => !item.pull_request);

    // 1. First poll / baseline initialization: establishes baseline at latest issue without creating runs
    if (!trigger.lastPollHash) {
      if (issues.length > 0) {
        const baselineIssue = issues[0];
        console.log(`[polling] GitHub trigger ${trigger.id}: baseline at issue #${baselineIssue.number}`);
        await prisma.trigger.update({
          where: { id: trigger.id },
          data: { lastPollHash: String(baselineIssue.id) },
        });
      }
      return;
    }

    if (!latestIssueId && issues.length > 0) {
      latestIssueId = String(issues[0].id);
      // If the latest issue is already the cursor, nothing new has arrived
      if (trigger.lastPollHash === latestIssueId) {
        return;
      }
    }

    for (const issue of issues) {
      if (String(issue.id) === trigger.lastPollHash) {
        foundCursor = true;
        break;
      }
      newIssues.push(issue);
    }

    // Stop paginating if we reached the cursor or if GitHub returned fewer items than the page limit
    if (foundCursor || items.length < PER_PAGE) {
      break;
    }

    page++;
  }

  // Process detected issues in chronological order (oldest to newest)
  for (const newIssue of newIssues.reverse()) {
    const payload = githubIssuePayload(newIssue, cleanRepo);

    const idempotencyKey = `${trigger.id}-issue-${newIssue.id}`;
    let run = null;

    try {
      run = await prisma.zapRun.create({
        data: {
          zapId: trigger.zapId,
          status: "QUEUED",
          idempotencyKey,
          triggerPayload: payload,
        },
      });
    } catch (err) {
      if (err.code === "P2002") {
        // Idempotency: ZapRun already exists from a previous attempt
        run = await prisma.zapRun.findUnique({
          where: { idempotencyKey },
        });
      } else {
        throw err;
      }
    }

    if (!run) {
      throw new Error(`Failed to create or locate ZapRun for issue ${newIssue.id}`);
    }

    // Enqueue if the run is still in QUEUED status
    if (run.status === "QUEUED") {
      await zapExecutionQueue.add(
        "execute-zap-run",
        { zapRunId: run.id },
        { jobId: `zap-run-${run.id}` }
      );
      console.log(`[polling] GitHub: queued run ${run.id} for new issue #${newIssue.number}`);
    }

    // Advance cursor incrementally ONLY after successful persistence and queueing
    await prisma.trigger.update({
      where: { id: trigger.id },
      data: { lastPollHash: String(newIssue.id) },
    });
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

  // Oldest first; the marker moves only after each email's run is saved and queued.
  // If an email can't be fetched or saved, stop here and pick it up on the next poll.
  for (const msgSummary of newMessages.reverse()) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgSummary.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!msgRes.ok) {
        console.warn(`[polling] Gmail message ${msgSummary.id} fetch failed (${msgRes.status}); will retry next poll`);
        return;
      }

      const msgData = await msgRes.json();
      const payload = gmailMessagePayload(msgData);
      const { run, created } = await createAndQueueRun(prisma, zapExecutionQueue, {
        zapId: trigger.zapId,
        idempotencyKey: `${trigger.id}-gmail-${msgData.id}`,
        triggerPayload: payload,
      });
      if (created) console.log(`[polling] Gmail: queued run ${run.id} for message "${payload.email.subject || msgData.id}"`);
      await advanceMarker(trigger, msgSummary.id);
    } catch (err) {
      console.error(`[polling] Error processing Gmail message ${msgSummary.id}; will retry next poll:`, err.message);
      return;
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

  // Joins public channels automatically on not_in_channel; throws a readable error otherwise.
  let messages;
  try {
    messages = await fetchChannelHistory(accessToken, channelId);
  } catch (err) {
    console.warn(`[polling] Slack trigger ${trigger.id}: ${err.message}`);
    return;
  }
  if (messages.length === 0) return;

  const validMessages = messages.filter((m) => m.type === "message" && !m.subtype);
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

  // Oldest first; the marker moves only after each message's run is saved and queued.
  const names = createSlackNameResolver(accessToken);
  for (const msg of newMessages.reverse()) {
    const payload = slackMessagePayload(msg, channelId, {
      userName: await names.userName(msg.user),
      channelName: await names.channelName(channelId),
    });
    const { run, created } = await createAndQueueRun(prisma, zapExecutionQueue, {
      zapId: trigger.zapId,
      idempotencyKey: `${trigger.id}-slack-${msg.ts}`,
      triggerPayload: payload,
    });
    if (created) console.log(`[polling] Slack: queued run ${run.id} for new message`);
    await advanceMarker(trigger, msg.ts);
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

async function pollSingleTrigger(trigger) {
  const provider = trigger.config?.provider || "";
  if (provider === "github") {
    return await pollGitHubTrigger(trigger);
  }
  if (provider === "gmail") {
    return await pollGmailTrigger(trigger);
  }
  if (provider === "slack") {
    return await pollSlackTrigger(trigger);
  }
}

let isSchedulerRunning = false;
let isCycleRunning = false;
let schedulerTimeout = null;
let activeCyclePromise = null;

async function executeCycle() {
  if (isCycleRunning) {
    console.log("[polling] Previous cycle still running, skipping overlap");
    return activeCyclePromise;
  }
  isCycleRunning = true;
  activeCyclePromise = (async () => {
    try {
      await runPollingCycle();
    } catch (err) {
      console.error("[polling] Unhandled error in polling cycle:", err.message);
    } finally {
      isCycleRunning = false;
      activeCyclePromise = null;
    }
  })();

  return activeCyclePromise;
}

async function waitForPollingCycle() {
  if (activeCyclePromise) {
    console.log("[polling] Waiting for active polling cycle to finish...");
    await activeCyclePromise;
    console.log("[polling] Active polling cycle finished.");
  }
}

function resolvePollingInterval(customIntervalMs) {
  const MIN_INTERVAL_MS = 1000;
  const DEFAULT_INTERVAL_MS = POLL_CYCLE_MS;

  const validate = (val) => {
    if (val === undefined || val === null) return null;
    if (typeof val !== "number" && typeof val !== "string") return NaN;
    if (typeof val === "string" && val.trim() === "") return null;
    const num = Number(val);
    return (Number.isFinite(num) && num >= MIN_INTERVAL_MS) ? num : NaN;
  };

  // 1. Explicit custom interval takes first precedence
  if (customIntervalMs !== undefined) {
    const custom = validate(customIntervalMs);
    return (custom !== null && !isNaN(custom)) ? custom : DEFAULT_INTERVAL_MS;
  }

  // 2. POLL_CYCLE_MS from environment
  if (process.env.POLL_CYCLE_MS !== undefined) {
    const envCycle = validate(process.env.POLL_CYCLE_MS);
    if (envCycle !== null) {
      return !isNaN(envCycle) ? envCycle : DEFAULT_INTERVAL_MS;
    }
  }

  // 3. POLL_INTERVAL_MS from environment
  if (process.env.POLL_INTERVAL_MS !== undefined) {
    const envInterval = validate(process.env.POLL_INTERVAL_MS);
    if (envInterval !== null) {
      return !isNaN(envInterval) ? envInterval : DEFAULT_INTERVAL_MS;
    }
  }

  // 4. Default fallback (5 minutes)
  return DEFAULT_INTERVAL_MS;
}

async function startPollingScheduler(customIntervalMs) {
  if (isSchedulerRunning) {
    console.log("[polling] Polling scheduler is already running in this process.");
    return;
  }
  isSchedulerRunning = true;

  const interval = resolvePollingInterval(customIntervalMs);
  console.log(`[polling] Polling cron engine started (interval: ${Math.round(interval / 1000)}s)`);

  const scheduleNext = () => {
    if (!isSchedulerRunning) return;
    schedulerTimeout = setTimeout(async () => {
      await executeCycle();
      scheduleNext();
    }, interval);
    if (schedulerTimeout.unref) schedulerTimeout.unref();
  };

  // Run first cycle immediately, then schedule subsequent cycles without overlap
  executeCycle().finally(() => {
    scheduleNext();
  });
}

function stopPollingScheduler() {
  isSchedulerRunning = false;
  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
    schedulerTimeout = null;
  }
  console.log("[polling] Polling scheduler stopped.");
}

if (require.main === module) {
  startPollingScheduler();
}

module.exports = {
  runPollingCycle,
  pollGitHubTrigger,
  pollGmailTrigger,
  pollSlackTrigger,
  pollSingleTrigger,
  startPollingScheduler,
  stopPollingScheduler,
  resolvePollingInterval,
  waitForPollingCycle,
};
