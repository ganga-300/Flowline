# Milestone 10: AI Step (OpenRouter) — LLM-Powered Data Transform

**Date:** 02-08-2026

## What was built
- New `AI` step type: resolves a prompt template (`{{trigger.message}}`
  style placeholders, using the same `resolveTemplate` helper the ACTION
  step uses for its body) against the run's context, then calls
  OpenRouter's `/chat/completions` endpoint and stores the model's
  response in `StepExecution.output`, available to any later step in the
  chain via `{{steps.step_ai_1.output.content}}`.
- Reused the existing retry infrastructure — `executeWithRetry` now
  dispatches to either `executeActionStep` or `executeAiStep` based on
  `step.type`, so the AI step gets the same 3-attempt exponential backoff
  as any HTTP action, with zero duplicated retry logic.
- Verified live: a message describing an angry customer complaint was
  correctly summarized by a real free-tier model into a one-line
  actionable summary, stored and queryable in `StepExecution.output`.

## Real debugging encountered
- **Missing env var, not a code bug**: initial `401 Missing Authentication
  header` wasn't a code problem — `OPENROUTER_API_KEY` simply didn't exist
  yet in `apps/worker/.env` (only `DATABASE_URL` was there). Same class of
  bug seen repeatedly this project: a working piece of code failing
  because of an environment/config gap, not logic.
- **Free-tier model rotation**: the specific model ID initially used
  (`meta-llama/llama-3.1-8b-instruct:free`) had been delisted from
  OpenRouter's free tier within days of being chosen — confirmed this is
  a known, frequent occurrence on OpenRouter (free models rotate with
  little notice). Fixed by switching to `openrouter/free`, OpenRouter's
  own auto-router that selects an available free model automatically,
  rather than hardcoding one volatile model ID.
- **Return-shape mismatch causing a silent NULL, not a crash**:
  `executeAiStep` originally returned `{ content }`, while the shared
  save-logic expected `{ output: {...} }` (matching `executeActionStep`'s
  shape). The job completed with status `SUCCESS` — no error, no
  crash — but `StepExecution.output` was silently `NULL`, because
  `result.output` was `undefined` on the AI branch. A useful reminder that
  "the job succeeded" and "the data is actually correct" are two
  different things to verify separately; a green status doesn't guarantee
  correct output when two code paths are expected to share a data shape.

## Design takeaway worth remembering
Never hardcode a specific external model/version ID when the provider's
own list is known to rotate — either use the provider's auto-selection
mechanism (as done here with `openrouter/free`) or maintain an explicit
fallback list. This is the same "don't couple to volatile external state"
principle as the idempotency and rate-limiting work, applied to model
selection instead of request identity or call frequency.