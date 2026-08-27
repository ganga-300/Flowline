# Milestone 15: Data Picker, Polling Engine & Step Testing

**Date:** 2026-08-28

## What was built

### Visual Data Picker (Milestone 1)
- Created `DataPicker.jsx` component — a context-aware variable picker
  that lets users insert `{{trigger.body.email}}` or `{{steps.stepId.output}}`
  into step configuration fields without remembering mustache syntax.
- Updated `ActionFieldRenderer.jsx` — each input field now has an
  "⚡ Insert Variable" button that opens the DataPicker inline.
- Updated `ActionFormRenderer.jsx` and `ActionIntegrationSelector.jsx`
  to thread `sampleData` and `steps` props down to the field renderer.
- Added a "Sample Trigger Data" panel in the Trigger setup form showing
  the current sample payload as formatted JSON, with a "Test Trigger /
  Fetch Sample" button.

### Polling Cron Engine (Milestone 2)
- Added `lastPollHash` (String?) to the `Trigger` model and ran migration.
- Created `pollingCron.js` in `apps/worker/src/` — a standalone Node
  process that runs an infinite loop every 5 minutes:
  1. Fetches all `POLLING` triggers whose parent Zap is `ENABLED`.
  2. Executes a GET request to the trigger's configured URL.
  3. SHA-256 hashes the response body.
  4. If the hash differs from `lastPollHash`, creates a `ZapRun` with
     the new data as `triggerPayload` and enqueues it on the
     `zap-execution` BullMQ queue.
  5. Idempotency key = `triggerId-poll-hash` prevents duplicate runs
     for the same data snapshot.

### Step Testing in UI (Milestone 3)
- Created `routes/testStep.js` on the server:
  - `POST /zaps/test-step` — accepts `{ step, sampleContext }`, runs
    the step in isolation (ACTION with integration handler, custom HTTP,
    AI, or FILTER), returns `{ status, output, error }`.
  - `GET /zaps/test-step/sample/:triggerId` — returns the most recent
    `triggerPayload` from the last `ZapRun` for that trigger, or a
    default sample if no runs exist yet.
- Replaced the "Test after saving" placeholder in the Zap builder
  with a live "⚡ Test Step Now" button. On click, it POSTs the
  current step draft + sample context to the test endpoint and
  renders the result inline (green SUCCESS card with JSON output,
  or red ERROR card with error message).

## What was learned
- The test-step endpoint reuses worker integration handlers directly
  via relative require paths (`../../../worker/src/integrations/registry`),
  avoiding code duplication. This works in monorepo dev but would need
  a shared package if the projects are ever separated.
- Mounting `/zaps/test-step` *before* `/zaps` in Express is critical —
  otherwise the `:id` param route on `/zaps/:id` would swallow
  `test-step` as an ID value.
