# Milestone 16: Formatter, Looping Engine, Integrations Expansion & Failure Alerts

**Date:** 2026-08-28

## What was built

### Formatter Step (Milestone 4)
- Created `apps/worker/src/formatter.js` — executeFormatterStep:
  - **Text Operations**: `uppercase`, `lowercase`, `capitalize`, `split` (to array), `replace` (find/replace substrings).
  - **Math Operations**: `add`, `subtract`, `multiply`, `divide`, `round` (decimal precision).
  - **Date Operations**: ISO, YYYY-MM-DD, Timestring conversions.
- Added `FORMATTER` to `StepType` in Prisma schema & ran migration.
- Wired into `apps/worker/src/index.js` retry loop and `apps/server/src/routes/testStep.js`.
- Added Formatter drawer configuration form and step type selector popover button in `NewZapBuilderPage`.

### Looping Engine (Milestone 5)
- Added `LOOP` to `StepType` in Prisma schema & ran migration.
- Updated `executeStepList` in `apps/worker/src/index.js`:
  - Resolves array path from context (`step.config.arrayPath`).
  - Iterates over items in array, sets `context.loopItem = item` and `context.loopIndex = i`.
  - Executes all child steps for each item.
- Added Loop drawer form and popover button in `NewZapBuilderPage`.

### High-Value Integrations Expansion (Milestone 6)
- **Slack Integration**:
  - Worker handler: `apps/worker/src/integrations/slack/sendMessage.js` (posts via webhook or bot token).
  - UI schema: `apps/web/src/integrations/slack/index.js`.
- **Discord Integration**:
  - Worker handler: `apps/worker/src/integrations/discord/sendMessage.js` (posts via channel webhook URL).
  - UI schema: `apps/web/src/integrations/discord/index.js`.
- **Google Sheets Integration**:
  - Worker handler: `apps/worker/src/integrations/google_sheets/appendRow.js` (appends rows via Google Sheets API v4).
  - UI schema: `apps/web/src/integrations/google_sheets/index.js`.
- Registered all 3 integrations in both `worker/src/integrations/registry.js` and `web/src/integrations/index.js`.

### Error Notifications & Alerts System (Milestone 7)
- Created `Alert` model in `prisma/schema.prisma` with relations to `User` and `Zap`.
- Updated worker error handling: when a `ZapRun` permanently fails, an `Alert` record is created with the Zap name, error message, and stack trace.
- Created `apps/server/src/routes/alerts.js`: `GET /alerts` (list user alerts) and `DELETE /alerts/:id` (dismiss alert). Mounted under `/alerts`.
- Created `apps/web/src/app/alerts/page.js` — dashboard view displaying failure alerts with live status, timestamp, expandable stack trace, and dismiss functionality.
- Added `🔔 Alerts` link to top header navigation in Dashboard page.

## Verification
- Migrations applied cleanly (`add-formatter-loop-step-types`, `add-alert-model`).
- Code pushed to GitHub repository on `main` branch.
