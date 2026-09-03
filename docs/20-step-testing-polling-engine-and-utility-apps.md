# Milestone 20: Step Testing, Polling Engine & Native Utility Apps

**Date:** 2026-09-03

## What was built

### Isolated Step Testing in UI (Milestone 4)
- Connected `POST /zaps/test-step` endpoint to invoke real worker integration handlers (`gmail`, `slack`, `discord`, `google_sheets`, `formatter`, `math`) directly from the builder.
- Provided structured key-value output preview in the Zap builder to verify action outputs prior to publishing.

### Background Polling Cron Engine (Milestone 5)
- Automated background polling service (`apps/worker/src/pollingCron.js`) running on a 5-minute interval.
- Seamlessly polls external HTTP endpoints and Google Sheets API worksheets.
- Computes SHA-256 state hashes to detect new data rows and enqueues idempotent `ZapRun` executions to Redis/BullMQ.

### Native Utility Apps: Formatter & Math (Milestone 6)
- Created **Formatter by Flowline** integration:
  - `capitalize_text`: Converts text to Title Case, UPPERCASE, or lowercase.
  - `format_date`: Formats raw date strings into standard formats (`YYYY-MM-DD`, `MM/DD/YYYY`, `DD Month YYYY`, `FULL_READABLE`).
  - `extract_regex`: Extracts patterns and captured groups via Regular Expressions.
- Created **Math by Flowline** integration:
  - `calculate`: Supports arithmetic operations (Add, Subtract, Multiply, Divide, Round) with variable resolution.
- Integrated handlers into both web frontend and worker runtime execution registry.

## Verification
- Verified Next.js compilation with `npm run build`.
- Pushed changes to GitHub repository with one-liner commit messages.
