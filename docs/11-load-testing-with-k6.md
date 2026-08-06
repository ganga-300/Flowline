# Milestone 11: Load Testing with k6 — Real Measured Numbers

**Date:** 06-08-2026

## What was built
- **Webhook throughput test**: 10 VUs, 30s duration, hitting `POST
  /webhooks/:token` directly. Result: **82.4 req/s sustained, p95 latency
  26.35ms, 0% failures** across 2,480 requests — measures how fast the
  server can accept and enqueue a trigger, independent of how long actual
  execution takes.
- **End-to-end execution test**: 3 VUs, 15 iterations, each triggering a
  run and polling `GET /zaps/:id/runs/:runId` until terminal status.
  Result: **avg 40.2s, p95 61.4s** total time from trigger to completion,
  against a Zap containing a 10-second delay step and a 1 token/sec rate
  limiter — with the underlying HTTP calls themselves still measured at
  p95 20ms, confirming the added latency is attributable to the
  intentional delay/rate-limit steps, not the engine itself.

## Real debugging encountered
- **Load testing accidentally created a real production-like backlog**:
  the first webhook-throughput test used the live webhook endpoint, which
  has real side effects (creates a `ZapRun` + enqueues a real job per
  request). 2,480 test requests meant 2,480 real jobs queued behind each
  other, rate-limited at ~1/sec with a 10s delay each — a multi-hour
  backlog that silently blocked a later, unrelated test from completing.
  Diagnosed by checking `ZapRun` rows directly (all stuck in `QUEUED`)
  and worker logs (still actively processing job #350+ from the earlier
  test). Fixed by flushing the Redis queue (`FLUSHALL` via `redis-cli`)
  before the next test.
- Lesson worth remembering explicitly: load testing against an endpoint
  with real side effects is not neutral — it needs either a dedicated
  test/staging environment, or an explicit cleanup step between runs, the
  same way a database test suite would reset state between test cases.

## Key interview-ready distinction
Webhook latency (p95 20ms) and end-to-end execution latency (p95 61s) are
answers to two different questions — "how fast can the system accept
work" vs. "how long does a full run take including intentional waits."
Reporting only one of these would be misleading in either direction.
Being able to decompose total latency into its components (network,
queue wait, rate-limit wait, deliberate delay, actual step execution) is
the actual skill being demonstrated here, not the raw numbers themselves.