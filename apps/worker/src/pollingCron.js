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
