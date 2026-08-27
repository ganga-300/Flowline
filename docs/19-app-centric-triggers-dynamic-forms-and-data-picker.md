# Milestone 19: App-Centric Triggers, Dynamic Forms & Visual Data Picker

**Date:** 2026-08-28

## What was built

### App-Centric Triggers (Milestone 1)
- Built `apps/web/src/integrations/triggers.js` — a Trigger Registry mapping App Providers (`google_sheets`, `github`, `gmail`, `webhook`) to user-friendly "When this happens..." trigger events (`google_sheets:new_row`, `github:new_issue`, etc.).
- Redesigned the Trigger setup form in `NewZapBuilderPage`:
  - User selects App Provider and Event.
  - Hides all raw technical jargon ("Webhook Endpoint", "Polling Interval") from the UI.
  - Automatically assigns underlying trigger execution engine (`WEBHOOK` vs `POLLING`).

### Dynamic Form Engine & Dependent Fields (Milestone 2)
- Added `type === "sheets"` support to `GET /connections/:id/options` endpoint.
- Updated `ActionFormRenderer.jsx` to render an animated loading indicator (`⏳ Loading Worksheet Tabs...`) while resolving dependent fields when a parent spreadsheet is selected.

### Visual Data Picker & Pill Tags (Milestone 3)
- Integrated `VariablePickerModal.jsx` and `PillInput.jsx` — converts mustache template tokens (`{{trigger.body.email}}`) into styled visual badge tags (`⚡ Email`) in input fields.
- Wired sample data loader to render real key-value pairs (`Customer Name`, `Email Address`).

## Verification
- Verified Next.js production compilation with `npm run build`.
- Pushed to GitHub repository with one-liner commit messages after each milestone.
