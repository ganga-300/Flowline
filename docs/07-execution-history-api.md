# Milestone 7: Execution History API (FR-13)

**Date:** [apni date daal do]

## What was built
- `GET /zaps/:id/runs` — lists a Zap's runs, newest first, with an
  optional `?status=` query filter (SUCCESS/FAILED/FILTERED/QUEUED/RUNNING).
- `GET /zaps/:id/runs/:runId` — full step-by-step trace for one run,
  including each step's own config alongside its execution record
  (status, input, output, error, attempt count).
- Verified against real accumulated test data from every prior milestone —
  filtering correctly isolated exactly the FAILED runs (3, from the retry
  and crypto-import debugging sessions) and exactly the FILTERED run (1,
  from the filter step test) out of 17 total runs.

## Known gap (not blocking, noted for later)
`ZapRun.startedAt`/`completedAt` are always `null` in the API response —
the worker never actually sets these fields when updating status, even
though they exist in the schema. Low-priority fix: add `startedAt: new
Date()` when a run transitions to RUNNING, and `completedAt: new Date()`
when it reaches a terminal status (SUCCESS/FAILED/FILTERED).

## Status check — where the 5-task plan stands
1. ✅ Webhook trigger + real ZapRun creation
2. ✅ Worker + Prisma + linear step execution
3. ✅ Retry with backoff + idempotency
4. ✅ Filter + branch steps
5. ✅ Execution history API (frontend view still pending)

Everything core to the "backend systems" learning goal — queues, retries,
branching execution graphs, idempotent triggers — is now built and
verified against real data, not just theory. Remaining scope: a minimal
Next.js view for this history data, and the AI/delay/OAuth steps that were
scoped as stretch goals beyond the original 5 tasks.