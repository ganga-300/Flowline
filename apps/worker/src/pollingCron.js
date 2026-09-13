require("dotenv").config();
const crypto = require("crypto");
const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const prisma = require("./prismaClient");

const connection = new IORedis("redis://localhost:6380", {
  maxRetriesPerRequest: null,
});

const zapExecutionQueue = new Queue("zap-execution", { connection });

const POLL_CYCLE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches all active POLLING triggers, executes API checks (HTTP or Google Sheets),
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
      let data = null;

      if (trigger.config?.provider === "github" || trigger.config?.event === "new_issue") {
        const repo = trigger.config?.repo || trigger.config?.repository;
        if (!repo) {
          console.log(`[polling] GitHub trigger ${trigger.id} has no repository configured, skipping`);
          continue;
        }

        const headers = {
          "User-Agent": "Flowline-Worker",
          Accept: "application/vnd.github.v3+json",
        };

        if (trigger.connection?.accessToken) {
          headers.Authorization = `Bearer ${trigger.connection.accessToken}`;
        } else if (process.env.GITHUB_TOKEN) {
          headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        }

        const cleanRepo = repo.trim().replace(/^https?:\/\/github\.com\//i, "");
        const url = `https://api.github.com/repos/${cleanRepo}/issues?state=open&sort=created&direction=desc&per_page=10`;

        const res = await fetch(url, { headers });
        if (!res.ok) {
          console.log(`[polling] GitHub fetch failed for ${cleanRepo} (trigger ${trigger.id}): ${res.status} ${res.statusText}`);
          continue;
        }

        const items = await res.json();
        if (!Array.isArray(items)) {
          console.log(`[polling] Unexpected GitHub API response for ${cleanRepo}`);
          continue;
        }

        const issues = items.filter((item) => !item.pull_request);
        if (issues.length === 0) continue;

        const latestIssue = issues[0];
        const latestIssueId = String(latestIssue.id);

        if (!trigger.lastPollHash) {
          console.log(`[polling] Trigger ${trigger.id}: established baseline at issue #${latestIssue.number} (ID: ${latestIssueId}) in ${cleanRepo}`);
          await prisma.trigger.update({
            where: { id: trigger.id },
            data: { lastPollHash: latestIssueId },
          });
          continue;
        }

        if (trigger.lastPollHash === latestIssueId) {
          console.log(`[polling] Trigger ${trigger.id}: no new issues detected in ${cleanRepo}`);
          continue;
        }

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
            console.log(`[polling] Trigger ${trigger.id}: queued run ${run.id} for new issue #${newIssue.number} in ${cleanRepo}`);
          } catch (err) {
            if (err.code === "P2002") {
              console.log(`[polling] Trigger ${trigger.id}: duplicate run skipped for issue #${newIssue.number}`);
            } else {
              throw err;
            }
          }
        }

        continue;
      }

      if (trigger.config?.provider === "google_sheets" && trigger.connection) {
        const spreadsheetId = trigger.config?.spreadsheetId;
        const range = trigger.config?.range || "Sheet1!A1:Z";
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
        
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${trigger.connection.accessToken}` },
        });
        if (!res.ok) {
          console.log(`[polling] Google Sheets poll failed for trigger ${trigger.id}: ${res.status}`);
          continue;
        }
        data = await res.json();
      } else {
        const url = trigger.config?.url;
        if (!url) {
          console.log(`[polling] Trigger ${trigger.id} has no URL configured, skipping`);
          continue;
        }

        const headers = trigger.config?.headers || {};
        const res = await fetch(url, {
          method: "GET",
          headers: { "Content-Type": "application/json", ...headers },
        });

        if (!res.ok) {
          console.log(`[polling] Trigger ${trigger.id} fetch failed: ${res.status}`);
          continue;
        }

        data = await res.json();
      }

      if (!data) continue;

      const dataStr = JSON.stringify(data);
      const hash = crypto.createHash("sha256").update(dataStr).digest("hex");

      if (hash === trigger.lastPollHash) {
        console.log(`[polling] Trigger ${trigger.id}: no change detected`);
        continue;
      }

      // New data detected — update hash and queue a run
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
        console.log(`[polling] Trigger ${trigger.id}: new data detected, queued run ${run.id}`);
      } catch (err) {
        if (err.code === "P2002") {
          console.log(`[polling] Trigger ${trigger.id}: duplicate run skipped`);
        } else {
          throw err;
        }
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
