require("dotenv").config();
const { fetchWithTimeout } = require("./fetchWithTimeout");
const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const { redisUrl } = require("../../server/src/config");
const prisma = require("./prismaClient");
const { createGmailClient, getCurrentHistoryId, listAddedMessageIds, listMessageIds } = require("./integrations/gmail/mailbox");
const { createGitHubClient, latestIssues, issuesAbove, issueByNumber, scanIssuePages, branchHead, commitsBetween, commitsOnBranch } = require("./integrations/github/repoApi");
const {
  githubIssuePayload,
  githubCommitPayload,
  gmailMessagePayload,
  slackMessagePayload,
} = require("./integrations/triggerPayloads");
const { fetchChannelHistory, fetchChannelHistorySince } = require("./integrations/slack/channelHistory");
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
 * Polling handler for GitHub triggers (new_issue, new_push).
 * HTTP failures (rate limit, 404, 5xx) are logged and the checkpoint stays, as before; a
 * backlog too long to read in one poll is logged the same way. Network errors/timeouts and
 * database/queue failures are thrown (the cycle logs them; manual Run reports them).
 */
async function pollGitHubTrigger(trigger) {
  const repo = trigger.config?.repo || trigger.config?.repository;
  if (!repo) {
    console.log(`[polling] GitHub trigger ${trigger.id} has no repository configured, skipping`);
    return;
  }

  const cleanRepo = repo.trim().replace(/^https?:\/\/github\.com\//i, "");
  const event = trigger.config?.event || "new_issue";
  const client = createGitHubClient(trigger.connection?.accessToken || process.env.GITHUB_TOKEN);

  try {
    if (event === "new_push") {
      await pollGitHubPushes(trigger, client, cleanRepo);
    } else {
      await pollGitHubIssues(trigger, client, cleanRepo);
    }
  } catch (err) {
    if (!err.status && !err.backlog) throw err;
    console.warn(`[polling] GitHub trigger ${trigger.id} (${cleanRepo}): ${err.message}; will retry next poll`);
  }
}

/**
 * new_issue. Checkpoint = "n:<number>", the highest issue number handled. Numbers are given
 * out in order of arrival in the repo - also to issues imported with an old creation date or
 * transferred in from another repo (which keep their date and id) - so "new" means
 * number > checkpoint. The listing is sorted by creation date, so it can't be trusted to
 * show those; every number between the checkpoint and the highest one seen that the listing
 * didn't show is fetched by number. Deleted or transferred-away numbers are skipped.
 * Pull requests share the numbering: they move the checkpoint but never run.
 *
 * A number that isn't there is ambiguous: deleted (or transferred away), or not given out
 * yet. It counts as deleted only when a higher number exists; otherwise the checkpoint stops
 * below it. Single-issue lookups are capped per poll (MAX_ISSUE_LOOKUPS); the checkpoint moves
 * up to the last resolved number and the next poll carries on, so a long run of gaps takes
 * several polls but never blocks the trigger. A backlog longer than one poll's page limit is
 * read oldest-first and resumed on the next poll (see issuesAbove).
 * Older triggers hold an issue id (previous poller); see migrateIdCheckpoint.
 */
const MAX_ISSUE_LOOKUPS = 100; // single-issue requests per poll (gaps + look-ahead)
const ISSUE_LOOKAHEAD = 3; // numbers checked above the highest known one: bridges 2 deleted in a row
const issueCheckpoint = (number) => `n:${number}`;

/**
 * Issue checkpoint formats (Trigger.lastPollHash):
 *  "n:<number>"                 - normal.
 *  "<id>"                       - previous poller (an issue id); migrated on the next poll.
 *  "pending:<id>"               - migrated, but that issue was deleted and its number is unknown;
 *                                 waiting for an issue that is provably newer. Needs a person.
 *  "pending:<id>:n:<number>"    - as above, but issues above <number> are provably new and are
 *                                 being processed. Below it is unresolved. Needs a person.
 */
function parseIssueCheckpoint(value) {
  let m;
  if ((m = /^n:(\d+)$/.exec(value))) return { number: Number(m[1]), format: issueCheckpoint };
  if ((m = /^pending:(\d+):n:(\d+)$/.exec(value))) {
    return { number: Number(m[2]), pendingOldId: Number(m[1]), format: (n) => `pending:${m[1]}:${issueCheckpoint(n)}` };
  }
  if ((m = /^pending:(\d+)$/.exec(value))) return { waitingOldId: Number(m[1]) };
  if (/^\d+$/.test(value)) return { oldId: Number(value) };
  return null;
}

function warnIssueCheckpointNeedsAttention(trigger, repo, oldId, provenFrom) {
  console.warn(
    `[polling] GitHub trigger ${trigger.id} (${repo}) needs attention: the issue its old checkpoint pointed to (id ${oldId}) ` +
      "no longer exists and its number isn't recorded, so Flowline can't tell which earlier issues are new. " +
      (provenFrom
        ? `Issues #${provenFrom} and later are provably new and are being processed; earlier ones are not run and not marked handled. `
        : "No issue is provably new yet; nothing is run or marked handled until a newer issue is opened. ") +
      `To resolve, find the number of the last issue already handled and run: UPDATE "Trigger" SET "lastPollHash" = 'n:<number>' WHERE id = '${trigger.id}'; ` +
      "issues after it will then run once (those already run are skipped)."
  );
}

/**
 * Checks the numbers just above `highest` (an issue imported with an old date, or transferred
 * in, with nothing newer opened since - the listing doesn't show it near the top). Allows
 * ISSUE_LOOKAHEAD - 1 missing numbers in a row. -> the highest number known to exist.
 */
async function lookAheadForIssues(client, repo, highest, byNumber, budget) {
  let top = highest;
  let misses = 0;
  for (let n = highest + 1; misses < ISSUE_LOOKAHEAD && budget.left > 0; n++) {
    budget.left -= 1;
    const issue = await issueByNumber(client, repo, n);
    if (issue) {
      byNumber.set(n, issue);
      top = n;
      misses = 0;
    } else {
      misses += 1;
    }
  }
  return top;
}

async function pollGitHubIssues(trigger, client, repo) {
  // First check: start after the highest number (empty repository: n:0, so the first issue
  // ever opened runs). No runs for anything already in the repo.
  if (!trigger.lastPollHash) {
    const byNumber = new Map();
    for (const item of await latestIssues(client, repo)) byNumber.set(Number(item.number), item);
    const highest = await lookAheadForIssues(client, repo, Math.max(0, ...byNumber.keys()), byNumber, { left: MAX_ISSUE_LOOKUPS });
    console.log(`[polling] GitHub trigger ${trigger.id}: baseline at issue #${highest}`);
    await advanceMarker(trigger, issueCheckpoint(highest));
    return;
  }

  let state = parseIssueCheckpoint(trigger.lastPollHash);
  if (!state) {
    console.warn(`[polling] GitHub trigger ${trigger.id}: unreadable checkpoint "${trigger.lastPollHash}"; starting from now`);
    await advanceMarker(trigger, null);
    return;
  }

  // Each step below may lead to the next one in the same poll.
  if (state.oldId !== undefined) {
    const number = await migrateIdCheckpoint(trigger, client, repo, state.oldId);
    const next = number !== null ? issueCheckpoint(number) : `pending:${state.oldId}`;
    await advanceMarker(trigger, next);
    state = parseIssueCheckpoint(next);
  }
  if (state.waitingOldId !== undefined) {
    const start = await firstIssueNumberAfterId(client, repo, state.waitingOldId);
    if (start === null) {
      warnIssueCheckpointNeedsAttention(trigger, repo, state.waitingOldId, null);
      return;
    }
    const next = `pending:${state.waitingOldId}:${issueCheckpoint(start - 1)}`;
    await advanceMarker(trigger, next);
    state = parseIssueCheckpoint(next);
  }
  if (state.pendingOldId !== undefined) {
    warnIssueCheckpointNeedsAttention(trigger, repo, state.pendingOldId, state.number + 1);
  }

  const checkpoint = state.number;
  const checkpointFor = state.format;
  const byNumber = new Map(); // one entry per number, even if pages overlap
  const listing = await issuesAbove(client, repo, checkpoint);
  for (const item of listing.items) byNumber.set(Number(item.number), item);
  const listedTop = Math.max(checkpoint, ...byNumber.keys());
  const budget = { left: MAX_ISSUE_LOOKUPS };

  // Numbers the date-sorted listing didn't show, lowest first: imported or transferred-in
  // issues (found by number), or deleted ones (a higher number exists: listedTop).
  let resolvedUpTo = checkpoint;
  for (let n = checkpoint + 1; n <= listedTop; n++) {
    if (!byNumber.has(n)) {
      if (budget.left === 0) break; // the rest next poll
      budget.left -= 1;
      const issue = await issueByNumber(client, repo, n);
      if (issue) byNumber.set(n, issue);
    }
    resolvedUpTo = n;
  }
  // Look above the highest listed issue only when the whole backlog was read (otherwise the
  // listing has newer issues still to come next poll).
  if (resolvedUpTo === listedTop && listing.complete) {
    resolvedUpTo = await lookAheadForIssues(client, repo, listedTop, byNumber, budget);
  }
  if (resolvedUpTo === checkpoint) return;

  // Oldest first. The checkpoint moves only after each issue's run is saved and queued. If
  // that fails, this throws and the checkpoint stays on the last issue that has a run;
  // createAndQueueRun dedupes anything redone on the next poll.
  const newer = [...byNumber.entries()].filter(([n]) => n > checkpoint && n <= resolvedUpTo).sort(([a], [b]) => a - b);
  let handledUpTo = checkpoint;
  for (const [number, issue] of newer) {
    if (issue.pull_request) continue;
    const { run, created } = await createAndQueueRun(prisma, zapExecutionQueue, {
      zapId: trigger.zapId,
      idempotencyKey: `${trigger.id}-issue-${issue.id}`,
      triggerPayload: githubIssuePayload(issue, repo),
    });
    if (created) console.log(`[polling] GitHub: queued run ${run.id} for new issue #${number}`);
    await advanceMarker(trigger, checkpointFor(number));
    handledUpTo = number;
  }
  // Trailing pull requests and deleted numbers: skip past them so they aren't fetched again.
  if (resolvedUpTo > handledUpTo) await advanceMarker(trigger, checkpointFor(resolvedUpTo));
}

/**
 * Previous poller's checkpoint: the id of the last issue it handled. Returns that issue's
 * NUMBER - everything numbered above it arrived later (normal, imported, transferred in) and
 * is treated as new; issues the old poller already ran are skipped by their idempotency key.
 *  1. The old poller ran that issue: its run's payload records the number.
 *  2. Otherwise (it was the starting point), find it in the issue list - every page, no
 *     early stop by date or id.
 * Returns null if neither works (the issue was deleted): its number can't be known, and
 * guessing could skip issues - the caller switches to the "pending" state instead.
 */
async function migrateIdCheckpoint(trigger, client, repo, oldId) {
  const run = await prisma.zapRun.findUnique({ where: { idempotencyKey: `${trigger.id}-issue-${oldId}` } });
  const ranNumber = Number(run?.triggerPayload?.issue?.number);
  if (ranNumber > 0) return ranNumber;

  let found = null;
  await scanIssuePages(client, repo, (items) => {
    const match = items.find((item) => Number(item.id) === oldId);
    if (match) found = Number(match.number);
    return found !== null;
  });
  return found;
}

/**
 * For an unknown old checkpoint (issue id `oldId`, deleted): the smallest issue number whose
 * id is higher. Ids are given out in creation order, so that issue was created after the old
 * checkpoint issue; numbers are given out in order of arrival, so it and every issue numbered
 * after it are provably new. Returns null if there's no such issue yet, or if the whole issue
 * list couldn't be read (a partial scan could miss a smaller number - not safe).
 * Cheap while waiting: one page, unless that page shows a higher id.
 */
async function firstIssueNumberAfterId(client, repo, oldId) {
  if (!(await latestIssues(client, repo)).some((item) => Number(item.id) > oldId)) return null;
  let smallest = Infinity;
  const { complete } = await scanIssuePages(client, repo, (items) => {
    for (const item of items) if (Number(item.id) > oldId) smallest = Math.min(smallest, Number(item.number));
    return false;
  });
  return complete && smallest !== Infinity ? smallest : null;
}

/**
 * new_push. Checkpoint = "<head sha>:<unix seconds>" of the default branch when it was last
 * handled ("empty" for a repository without commits; older triggers hold just a sha).
 * New commits = everything reachable from the current head but not from the checkpoint
 * commit, via GitHub's compare API - so it's correct across force pushes and merges:
 *  - normal push ("ahead"): the pushed commits;
 *  - force push that rewrote history ("diverged"): the commits of the new history since the
 *    common ancestor (rewritten commits are new commits with new shas, so they run);
 *  - force push back to an older commit ("behind"): no new commits; the checkpoint follows;
 *  - checkpoint commit deleted from GitHub (404): search commits by date since the last
 *    check, minus a margin; duplicates are deduped by sha.
 * The checkpoint moves only after every new commit's run is saved and queued (a sha in the
 * middle of a merge isn't a safe place to resume from).
 */
const GITHUB_PUSH_MARGIN_SEC = 60 * 60;
const pushCheckpoint = (sha, ms) => `${sha}:${Math.floor(ms / 1000)}`;

async function pollGitHubPushes(trigger, client, repo) {
  const startedAt = Date.now();
  const head = await branchHead(client, repo);

  if (!head) {
    if (!trigger.lastPollHash) {
      console.log(`[polling] GitHub trigger ${trigger.id}: repository is empty; waiting for the first push`);
      await advanceMarker(trigger, "empty");
    }
    return;
  }
  if (!trigger.lastPollHash) {
    console.log(`[polling] GitHub trigger ${trigger.id}: baseline at commit ${head.sha.slice(0, 7)}`);
    await advanceMarker(trigger, pushCheckpoint(head.sha, startedAt));
    return;
  }

  let commits;
  if (trigger.lastPollHash === "empty") {
    // First push to a repository that had no commits: everything on the branch is new -
    // unless it's a whole existing project's history, which would mean thousands of runs.
    try {
      commits = (await commitsOnBranch(client, repo, head.sha)).reverse();
    } catch (err) {
      if (!err.backlog) throw err;
      console.warn(`[polling] GitHub trigger ${trigger.id}: the first push to ${repo} has more commits than can be run at once (imported history?); starting from the current head without running them`);
      await advanceMarker(trigger, pushCheckpoint(head.sha, startedAt));
      return;
    }
  } else {
    const [baseSha, seconds] = trigger.lastPollHash.split(":");
    if (baseSha === head.sha) return;
    try {
      commits = (await commitsBetween(client, repo, baseSha, head.sha)).commits;
    } catch (err) {
      if (err.status !== 404) throw err;
      if (!seconds) {
        // Older checkpoint without a time: there's no way to tell which commits are new.
        console.warn(`[polling] GitHub trigger ${trigger.id}: last-seen commit ${baseSha.slice(0, 7)} no longer exists on GitHub (history rewritten) and the old checkpoint has no time to search from; starting from the current head. Check ${repo} for commits pushed since the last run.`);
        await advanceMarker(trigger, pushCheckpoint(head.sha, startedAt));
        return;
      }
      console.warn(`[polling] GitHub trigger ${trigger.id}: last-seen commit ${baseSha.slice(0, 7)} no longer exists on GitHub (history rewritten); finding new commits by date instead`);
      const since = new Date((Number(seconds) - GITHUB_PUSH_MARGIN_SEC) * 1000).toISOString();
      commits = (await commitsOnBranch(client, repo, head.sha, { since })).reverse();
    }
  }

  const seen = new Set();
  for (const commit of commits) {
    if (!commit?.sha || seen.has(commit.sha)) continue;
    seen.add(commit.sha);
    const { run, created } = await createAndQueueRun(prisma, zapExecutionQueue, {
      zapId: trigger.zapId,
      idempotencyKey: `${trigger.id}-commit-${commit.sha}`,
      triggerPayload: githubCommitPayload(commit, repo),
    });
    if (created) console.log(`[polling] GitHub: queued run ${run.id} for new commit ${commit.sha.slice(0, 7)}`);
  }
  await advanceMarker(trigger, pushCheckpoint(head.sha, startedAt));
}

/**
 * Gmail checkpoint, stored in Trigger.lastPollHash as "<historyId>:<unix seconds>":
 *  - historyId: Gmail's mailbox history position; everything added after it is new.
 *  - seconds: when that position was read. Used to narrow the search filter, and to catch
 *    up by searching if Gmail has expired the history id (it keeps about a week).
 * Older triggers hold a message id instead (the previous poller); see legacy handling below.
 */
const GMAIL_SEARCH_MARGIN_SEC = 60 * 60; // clock skew / delivery delay allowance
const parseGmailCheckpoint = (value) => {
  const match = /^(\d+):(\d+)$/.exec(value || "");
  return match ? { historyId: match[1], seconds: Number(match[2]) } : null;
};
const gmailCheckpoint = (historyId, ms) => `${historyId}:${Math.floor(ms / 1000)}`;

/**
 * Polling handler for Gmail triggers (new_email).
 * Every email added since the checkpoint (History API, all pages) that matches the user's
 * search gets exactly one run, oldest first. The checkpoint moves only after ALL of them are
 * saved and queued; on any failure it stays, and the next poll redoes the same range
 * (createAndQueueRun dedupes emails that already have a run).
 */
async function pollGmailTrigger(trigger) {
  if (!trigger.connection) {
    console.log(`[polling] Gmail trigger ${trigger.id} has no connected account, skipping`);
    return;
  }

  const query = trigger.config?.query || trigger.config?.q || "is:unread";
  const gmail = createGmailClient(trigger.connection);
  const startedAt = Date.now();

  try {
    // First check (also an empty inbox): start at the mailbox's current position.
    if (!trigger.lastPollHash) {
      const historyId = await getCurrentHistoryId(gmail);
      console.log(`[polling] Gmail trigger ${trigger.id}: baseline at history ${historyId}`);
      await advanceMarker(trigger, gmailCheckpoint(historyId, startedAt));
      return;
    }

    const checkpoint = parseGmailCheckpoint(trigger.lastPollHash);
    if (checkpoint) {
      let added;
      try {
        added = await listAddedMessageIds(gmail, checkpoint.historyId);
      } catch (err) {
        if (err.status !== 404) throw err;
        // History id expired: search instead, from just before the last successful check.
        console.warn(`[polling] Gmail trigger ${trigger.id}: history ${checkpoint.historyId} expired; catching up by search since the last check`);
        await catchUpGmailBySearch(trigger, gmail, query, checkpoint.seconds - GMAIL_SEARCH_MARGIN_SEC, startedAt);
        return;
      }

      if (added.messageIds.length > 0) {
        // History has every added message (sent mail, drafts, spam...). Keep only those the
        // user's search matches - the same filter the trigger always used.
        const matching = new Set(await listMessageIds(gmail, `(${query}) after:${checkpoint.seconds - GMAIL_SEARCH_MARGIN_SEC}`));
        await queueGmailRuns(trigger, gmail, added.messageIds.filter((id) => matching.has(id)));
      }
      if (added.historyId !== checkpoint.historyId) {
        await advanceMarker(trigger, gmailCheckpoint(added.historyId, startedAt));
      }
      return;
    }

    // Legacy checkpoint (a message id from the previous poller): catch up by search from
    // that email's arrival time, then switch to a history checkpoint.
    let legacy = null;
    try {
      legacy = await gmail.get(`/messages/${encodeURIComponent(trigger.lastPollHash)}`, { format: "minimal" });
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    if (!legacy?.internalDate) {
      console.warn(`[polling] Gmail trigger ${trigger.id}: its last-seen email no longer exists, so emails since then can't be found; starting from now. Check Gmail for emails received since the last run.`);
      await advanceMarker(trigger, gmailCheckpoint(await getCurrentHistoryId(gmail), startedAt));
      return;
    }
    await catchUpGmailBySearch(trigger, gmail, query, Math.floor(Number(legacy.internalDate) / 1000) - 60, startedAt);
  } catch (err) {
    // API, token, database or queue failure: the checkpoint is unchanged, so the next poll
    // retries the same range.
    console.warn(`[polling] Gmail trigger ${trigger.id}: ${err.message}; will retry next poll`);
  }
}

/**
 * Runs every email matching the search received after `sinceSeconds`, then sets a history
 * checkpoint read BEFORE searching - so an email arriving meanwhile is either found here or
 * in the history next time (or both: duplicates are deduped by idempotency key).
 */
async function catchUpGmailBySearch(trigger, gmail, query, sinceSeconds, startedAt) {
  const historyId = await getCurrentHistoryId(gmail);
  const ids = await listMessageIds(gmail, `(${query}) after:${sinceSeconds}`);
  await queueGmailRuns(trigger, gmail, ids.reverse()); // search is newest first
  await advanceMarker(trigger, gmailCheckpoint(historyId, startedAt));
}

/** Saves and queues one run per email, in the given order. Throws on the first failure. */
async function queueGmailRuns(trigger, gmail, messageIds) {
  for (const id of messageIds) {
    let msgData;
    try {
      msgData = await gmail.get(`/messages/${encodeURIComponent(id)}`, { format: "full" });
    } catch (err) {
      if (err.status !== 404) throw err;
      console.warn(`[polling] Gmail message ${id} was deleted before it could be read; skipped`);
      continue;
    }
    const payload = gmailMessagePayload(msgData);
    const { run, created } = await createAndQueueRun(prisma, zapExecutionQueue, {
      zapId: trigger.zapId,
      idempotencyKey: `${trigger.id}-gmail-${msgData.id}`,
      triggerPayload: payload,
    });
    if (created) console.log(`[polling] Gmail: queued run ${run.id} for message "${payload.email.subject || msgData.id}"`);
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
    const listRes = await fetchWithTimeout("https://slack.com/api/conversations.list?types=public_channel,private_channel", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const listData = await listRes.json().catch(() => ({}));
    if (listData.ok && Array.isArray(listData.channels)) {
      const match = listData.channels.find((c) => `#${c.name}` === channelId || c.name === channelId.replace("#", ""));
      if (match) channelId = match.id;
    }
  }

  // The marker (lastPollHash) is the ts of the newest message already handled.
  // First check: start after the newest message in the channel (any kind, so a channel
  // with only join notices still gets a starting point). Empty channel: start a minute
  // before this check, so the very first message ever posted is not mistaken for history.
  if (!trigger.lastPollHash) {
    const checkStartedAt = Date.now();
    let latest;
    try {
      latest = await fetchChannelHistory(accessToken, channelId);
    } catch (err) {
      console.warn(`[polling] Slack trigger ${trigger.id}: ${err.message}`);
      return;
    }
    const newest = latest.map((m) => m.ts).filter(Boolean).sort(compareSlackTs).at(-1);
    const baseline = newest || slackTsFromMs(checkStartedAt - 60_000);
    console.log(`[polling] Slack trigger ${trigger.id}: baseline at ts ${baseline}`);
    await advanceMarker(trigger, baseline);
    return;
  }

  // Every message after the marker, across pages. Joins public channels automatically on
  // not_in_channel; on any error (rate limit, timeout, backlog too long) nothing is
  // processed and the marker stays, so the next poll retries the same range.
  let messages;
  try {
    messages = await fetchChannelHistorySince(accessToken, channelId, trigger.lastPollHash);
  } catch (err) {
    console.warn(`[polling] Slack trigger ${trigger.id}: ${err.message}`);
    return;
  }

  // Strictly newer than the marker (Slack's `oldest` is exclusive; this is a safety net),
  // one entry per ts even if pages overlap, oldest first.
  const byTs = new Map();
  for (const m of messages) {
    if (m.ts && compareSlackTs(m.ts, trigger.lastPollHash) > 0) byTs.set(m.ts, m);
  }
  const newer = [...byTs.values()].sort((a, b) => compareSlackTs(a.ts, b.ts));
  if (newer.length === 0) return;

  // Oldest first; the marker moves only after each message's run is saved and queued.
  // If saving or queueing fails, this throws and the marker stays on the last message
  // that has a run; createAndQueueRun dedupes anything redone on the next poll.
  const names = createSlackNameResolver(accessToken);
  let handledUpTo = trigger.lastPollHash;
  for (const msg of newer) {
    if (msg.type !== "message" || msg.subtype) continue; // joins, edits, bots, ... don't trigger
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
    handledUpTo = msg.ts;
  }

  // Every message up to the newest one was handled or doesn't trigger: skip past trailing
  // non-triggering messages too, so they aren't fetched again on every poll.
  const newestTs = newer.at(-1).ts;
  if (compareSlackTs(newestTs, handledUpTo) > 0) await advanceMarker(trigger, newestTs);
}

/** Orders Slack ts strings ("1700000000.123456") exactly, without float rounding. */
function compareSlackTs(a, b) {
  const [aSec, aFrac = ""] = String(a).split(".");
  const [bSec, bFrac = ""] = String(b).split(".");
  const secDiff = Number(aSec) - Number(bSec);
  if (secDiff !== 0) return Math.sign(secDiff);
  return Math.sign(Number(aFrac.padEnd(6, "0")) - Number(bFrac.padEnd(6, "0")));
}

function slackTsFromMs(ms) {
  return `${Math.floor(ms / 1000)}.${String((ms % 1000) * 1000).padStart(6, "0")}`;
}

/**
 * Fetches all active POLLING triggers, checks GitHub, Gmail or Slack for new items and
 * queues a ZapRun per new item. Any other polling trigger (e.g. a legacy generic URL
 * poller, which the API no longer accepts) is skipped: nothing is fetched or run.
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

      console.warn(`[polling] Trigger ${trigger.id} (Zap ${trigger.zapId}) has unsupported provider "${provider}"; skipped. Disable or edit this Zap.`);
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
  compareSlackTs,
  pollSingleTrigger,
  startPollingScheduler,
  stopPollingScheduler,
  resolvePollingInterval,
  waitForPollingCycle,
};
