# 25 - Reliability fixes, crash test and load test results (2026-10-20)

## Environment (read this before quoting any number)
- One Linux VM: **4 vCPU (arm64), 3.9 GB RAM**. Postgres 17, Redis 7.2 (AOF on), the Express
  server, the BullMQ worker **and** the load generator (k6) all share those 4 CPUs.
- GitHub/Slack/Gmail were replaced by `apps/worker/loadtest/fake-providers.js` (40 ms per
  request) - no real accounts were called. Numbers measure Flowline, not the providers.
- Single server process, single worker process (BullMQ concurrency 1).

## 1. Fixes
| Problem | Fix | Proof |
|---|---|---|
| Gmail/Slack/GitHub-push pollers saved the "last seen" marker before creating runs -> a crash lost events | Marker advances per item only after its run is saved and queued (`pollingCron.js`) | `test/pollerMarker.test.js`: crash on 2nd of 3 items -> next poll creates exactly the missing runs (failed before the fix) |
| A run saved but not queued (crash in between) stayed QUEUED forever | One job id per run (`zap-run-<id>`); re-queue on duplicate events and on worker start (`runQueue.js`, webhooks route) | `test/runQueue.test.js`, `server/test/webhookIdempotency.test.js` |
| Every failure retried 3x, incl. ones the provider may have processed -> duplicates | Retry only 429/502/503/504/connection-not-established (`recovery.js`, handlers) | `test/recovery.test.js`, `test/retryClassification.test.js` |
| After a worker crash BullMQ re-ran the job and the worker redid **all** steps | Completed steps are skipped; a step that was mid-request is failed as "outcome unknown" instead of re-sent; finished runs are never re-run | Crash test below |
| Runs never recorded start/finish time | `startedAt` / `completedAt` set by the worker | used for latency below |

Provider APIs offer no idempotency keys, so exactly-once delivery is impossible. The design
is **at-most-once per step after a crash**: an ambiguous step is reported, not resent.

## 2. Crash test (`apps/worker/loadtest/crash-test.js`)
500 webhook events -> Zap with 2 steps (GitHub Create Issue -> Add Comment) = 1,000 provider
requests expected. Worker **SIGKILLed twice** (after the 240th and 640th provider request,
i.e. while a request was in flight) and restarted. 3 runs per version.

| Version | Events | Crashes | Lost runs | Stuck runs | Duplicate provider requests | "Outcome unknown" runs (not resent) |
|---|---|---|---|---|---|---|
| Before (commit 6520924) | 1,500 | 6 | 0 | 0 | **12** | 0 |
| After | 1,500 | 6 | 0 | 0 | **0** | 6 (all 6 had reached the provider - resending would have duplicated them) |

No crashes, after: 500/500 runs succeeded, 1,000 requests, 0 duplicates, 59 s total
(~8.5 runs/s; limited by sequential processing + 2 x 40 ms fake API calls per run).

Not covered by this test: server crashes (only the worker was killed) and the pollers'
lost-event fix (covered by unit tests, since pollers need real provider data).

## 3. Webhook ingestion capacity (`apps/worker/loadtest/ramp-webhooks.js`, k6)
Constant arrival rate, 15 s per level, unique payloads, worker stopped (measures the API:
validate token, save run in Postgres, queue job in Redis). Every 202 was checked against
the database: runs saved = jobs queued = requests accepted in every session.

| Target rate | Result across 4 k6 sessions |
|---|---|
| 100-1,000 req/s | Held every time: p95 2-6 ms, 0 errors, 0 requests k6 could not start |
| 1,500-3,000 req/s | Variable on this shared VM: sometimes p95 < 40 ms, sometimes p95 ~180-700 ms with 1-20% not started |
| 3,500-6,000 req/s | Saturated: throughput peaks at ~2,300-3,200 req/s, p95 370-690 ms |

Errors were 0% at every level, including overload - excess load queued instead of failing.
Honest summary: **sustains 1,000 req/s at p95 < 10 ms; saturates around 2,500-3,000 req/s**.

## 4. End-to-end latency with auth (`apps/worker/loadtest/end-to-end-test.js`, k6)
Webhook -> both steps done, polled via `GET /zaps/:id/runs/:runId` with a JWT.

| Concurrent users | Runs | Succeeded | p50 | p95 | p99 |
|---|---|---|---|---|---|
| 1 | 155 | 100% | 180 ms | 195 ms | 199 ms |
| 3 | 240 | 100% | 322 ms | 385 ms | 435 ms |

Includes the 2 x 40 ms fake API time; grows with concurrency because the worker runs one
job at a time.

## 5. Retry from failed step (`apps/worker/loadtest/retry-test.js`)
Real Postgres, Redis, server and worker; GitHub faked by `fake-providers.js`. Zap: Webhook ->
Create Issue -> Add Comment, with comments made to fail (404) and then fixed.

| Check | Result |
|---|---|
| Original run fails at step 2 after creating 1 issue | PASS |
| "Retry from failed step" (default for failed runs) succeeds | PASS |
| Issue created again | No (still 1) |
| Comment posted | Once, on the issue from the original run |
| Step 1 in the retry marked as reused from the original run | PASS |
| Control: "Run all steps again" creates the issue a second time | PASS (2 issues) |

How it works: the retry run stores `retryOfRunId`; on its first pass the worker copies the
original run's successful step results into it (one `createMany`, marked `reusedFromRunId`),
so the crash-recovery logic skips them and later steps can still use their outputs.

## How to rerun (your machine, with Postgres + Redis running)
```bash
cd apps/worker
node loadtest/setup-bench-zap.js > bench.json            # server must be running
FAKE_PROVIDER_LOG=/tmp/fake.log FAKE_PROVIDER_LATENCY_MS=40 EVENTS=500 KILL_AT=240,640 \
  BENCH_FILE=bench.json node loadtest/crash-test.js          # starts/kills its own worker
k6 run -e RATE=1000 -e WEBHOOK_TOKEN=<from bench.json> loadtest/ramp-webhooks.js   # worker stopped
```
Retry test: start the worker with `FAKE_PROVIDERS=1 FAKE_PROVIDER_LOG=/tmp/fake.log
FAKE_FAIL_COMMENTS_FILE=/tmp/fail-comments node -r ./loadtest/fake-providers.js src/index.js`, then
`BENCH_FILE=bench.json FAKE_PROVIDER_LOG=/tmp/fake.log FAKE_FAIL_COMMENTS_FILE=/tmp/fail-comments node loadtest/retry-test.js`.

Use a separate database: the tests create thousands of runs.
