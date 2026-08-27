# Milestone 18: Dependent Fields Engine, Polling Engine & Rich Integrations Expansion

**Date:** 2026-08-28

## What was built

### Dependent Fields Engine (Milestone 4)
- Created `apps/server/src/routes/dynamicFields.js`:
  - `GET /connections/:id/dynamic-fields?provider=google_sheets&action=append_row&parentKey=spreadsheetId&parentValue=...` — fetches dynamic child fields (such as worksheet tabs for a selected spreadsheet via Google Sheets API).
- Updated `ActionFormRenderer.jsx` to listen for parent field changes (e.g. `spreadsheetId`), fetch dependent child fields, and dynamically append them to the configuration form.

### Polling Engine (Milestone 5)
- Enhanced `apps/worker/src/pollingCron.js` to support provider polling (Google Sheets row count / data checks via Sheets API) in addition to standard HTTP GET polling.
- Hashes response bodies using SHA-256 to ensure idempotent execution — only enqueues `ZapRun` when actual data changes occur.

### Rich Integrations Expansion (Milestone 6)
- **Slack (Send Channel Message)**: Updated schema to use `dynamic_dropdown` (`optionsType: 'slack_channels'`) for selecting channels.
- **Google Sheets (Append Row)**: Updated schema to use `dynamic_dropdown` (`optionsType: 'google_sheets'`) for selecting spreadsheets, with automatic dependent field resolution for worksheet tabs.
- **Gmail (Advanced Send)**: Expanded `sendEmailAction` schema and worker MIME builder (`buildMimeMessage`) to support `CC` (`array`) and `BCC` (`array`) recipient headers.

## Verification
- Pushed to GitHub repository with one-liner commit messages after each milestone.
