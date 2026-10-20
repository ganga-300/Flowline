/**
 * TEST ONLY - crash test: sends EVENTS webhook events, SIGKILLs the worker while it is
 * processing them (KILL_AT = provider-request counts at which to kill), restarts it, waits
 * for every run to finish, then counts lost runs and duplicate provider requests.
 * The bench Zap has 2 steps (create issue, add comment), so each event = 2 requests.
 *
 * Needs: server running (API_URL), DATABASE_URL, Redis, bench.json from setup-bench-zap.js,
 * and the worker started WITH loadtest/fake-providers.js so provider requests are logged.
 *
 *   EVENTS=500 KILL_AT=120,320 BENCH_FILE=bench.json FAKE_PROVIDER_LOG=/tmp/fake.log \
 *     node loadtest/crash-test.js
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const prisma = require("../src/prismaClient");

const API = process.env.API_URL || "http://localhost:4000";
const EVENTS = Number(process.env.EVENTS || 500);
const KILL_AT = (process.env.KILL_AT ?? "120,320").split(",").filter(Boolean).map(Number);
const CONCURRENCY = Number(process.env.CONCURRENCY || 25);
const DRAIN_TIMEOUT_MS = Number(process.env.DRAIN_TIMEOUT_MS || 120000);
const bench = JSON.parse(fs.readFileSync(process.env.BENCH_FILE || "bench.json", "utf8"));
const providerLog = process.env.FAKE_PROVIDER_LOG;
const workerDir = path.join(__dirname, "..");
const runTag = `crash-${Date.now()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let unparsableLines = 0;
function receipts() {
  if (!fs.existsSync(providerLog)) return [];
  unparsableLines = 0;
  const out = [];
  // A line can be half-written while the worker is appending it (or if it was killed mid-write).
  for (const line of fs.readFileSync(providerLog, "utf8").split("\n").filter(Boolean)) {
    try { out.push(JSON.parse(line)); } catch { unparsableLines++; }
  }
  return out.filter((r) => r.body && typeof r.body.body === "string" && r.body.body.includes(runTag));
}

let worker;
const workerLog = fs.openSync(process.env.WORKER_LOG || path.join(workerDir, "crash-test-worker.log"), "a");
function startWorker() {
  worker = spawn(process.execPath, ["-r", "./loadtest/fake-providers.js", "src/index.js"], {
    cwd: workerDir, env: { ...process.env, FAKE_PROVIDERS: "1" }, stdio: ["ignore", workerLog, workerLog],
  });
  return worker.pid;
}

(async () => {
  const startedAt = Date.now();
  const kills = [];
  startWorker();

  // Fire all events (CONCURRENCY in flight), killing the worker at the configured points.
  let next = 0, accepted = 0, rejected = 0;
  const killWatcher = (async () => {
    for (const at of KILL_AT) {
      while (receipts().length < at) await sleep(20);
      const pid = worker.pid;
      worker.kill("SIGKILL");
      kills.push({ atReceipts: receipts().length, pid, t: Date.now() - startedAt });
      await sleep(1000);
      startWorker();
    }
  })();
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < EVENTS) {
      const seq = next++;
      const res = await fetch(`${API}/webhooks/${bench.webhookToken}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seq, runTag }),
      }).catch(() => null);
      if (res && res.status === 202) accepted++; else rejected++;
    }
  }));
  await killWatcher;

  // Wait for every run to reach a final state.
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let pending;
  do {
    await sleep(1000);
    pending = await prisma.zapRun.count({ where: { zapId: bench.zapId, status: { in: ["QUEUED", "RUNNING"] }, triggerPayload: { path: ["runTag"], equals: runTag } } });
  } while (pending > 0 && Date.now() < deadline);
  worker.kill("SIGTERM");

  const runs = await prisma.zapRun.findMany({
    where: { zapId: bench.zapId, triggerPayload: { path: ["runTag"], equals: runTag } },
    include: { stepExecutions: true },
  });
  const got = receipts();
  // One key per (step, event): "issue:<seq>" or "comment:<seq>".
  const keyOf = (r) => (r.url.endsWith("/comments")
    ? `comment:${String(r.body.body).match(/^comment (\S+)/)[1]}`
    : `issue:${String(r.body.title).replace("bench ", "")}`);
  const byKey = new Map();
  for (const r of got) byKey.set(keyOf(r), (byKey.get(keyOf(r)) || 0) + 1);
  const sentFor = (seq) => byKey.has(`issue:${seq}`) || byKey.has(`comment:${seq}`);
  const status = (s) => runs.filter((r) => r.status === s);
  const unknown = runs.filter((r) => r.stepExecutions.some((e) => /can't tell whether the app received it/.test(e.error || "")));
  const runSeqs = new Set(runs.map((r) => String(r.triggerPayload.seq)));
  const latencies = runs.filter((r) => r.completedAt).map((r) => new Date(r.completedAt) - new Date(r.createdAt)).sort((a, b) => a - b);
  const pct = (p) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] : null;

  const summary = {
    events: EVENTS, webhookAccepted: accepted, webhookRejected: rejected,
    workerKills: kills,
    runsCreated: runs.length,
    eventsWithoutRun: [...Array(EVENTS).keys()].filter((s) => !runSeqs.has(String(s))).length,
    succeeded: status("SUCCESS").length, failed: status("FAILED").length, stillPending: pending,
    unknownOutcomeRuns: unknown.length,
    unknownOutcomeActuallyDelivered: unknown.filter((r) => sentFor(r.triggerPayload.seq)).length,
    providerRequests: got.length,
    unparsableLogLines: unparsableLines,
    stepsSentTwiceOrMore: [...byKey.values()].filter((n) => n > 1).length,
    duplicateRequests: [...byKey.values()].reduce((sum, n) => sum + Math.max(0, n - 1), 0),
    succeededButMissingARequest: status("SUCCESS").filter((r) => !byKey.has(`issue:${r.triggerPayload.seq}`) || !byKey.has(`comment:${r.triggerPayload.seq}`)).length,
    triggerToDoneMs: { p50: pct(50), p95: pct(95), max: latencies.at(-1) ?? null },
    wallClockSeconds: Math.round((Date.now() - startedAt) / 1000),
  };
  const text = JSON.stringify(summary, null, 2);
  if (process.env.SUMMARY_FILE) fs.writeFileSync(process.env.SUMMARY_FILE, text);
  await prisma.$disconnect();
  // Flush stdout before exiting (process.exit can drop output written to a pipe).
  process.stdout.write(text + "\n", () => process.exit(0));
})().catch(async (e) => { console.error(e); if (worker) worker.kill("SIGKILL"); process.exit(1); });
