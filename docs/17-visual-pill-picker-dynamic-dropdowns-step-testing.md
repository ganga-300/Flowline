# Milestone 17: Visual Pill Variable Picker, Dynamic Dropdowns & Structured Step Testing

**Date:** 2026-08-28

## What was built

### Visual Pill Variable Picker (Milestone 1)
- Built `PillInput.jsx` — a custom input component that displays mustache variable syntax (`{{trigger.body.email}}`) as visual, styled badge tags (`⚡ Email`) while retaining raw template strings under the hood.
- Built `VariablePickerModal.jsx` — a popover modal listing available fields with human-readable labels (`Email Address`, `First Name`, `Subject`), instant search filtering, and sample value previews.
- Updated `ActionFieldRenderer.jsx` to render `PillInput` and `VariablePickerModal`.

### Dynamic Dropdowns & Rich Field Types (Milestone 2)
- Created `apps/server/src/routes/options.js`:
  - `GET /connections/:id/options?type=slack_channels|google_sheets|gmail_labels` — talks to third-party APIs (Slack API, Google Drive API) using stored OAuth access tokens to return live option choices (`[{ label: '#general', value: 'C123' }]`).
- Extended `ActionFieldRenderer.jsx` to support 6 field types:
  - `dropdown`: Static selection from field schema.
  - `dynamic_dropdown`: Fetches live choices from `GET /connections/:id/options`.
  - `boolean_toggle`: Checkbox / switch toggle.
  - `array`: Comma-separated list builder (e.g., CC/BCC emails).
  - `text` & `textarea`: Rendered with `PillInput`.

### Structured Step Testing (Milestone 3)
- Enhanced the "Test Step" drawer tab in `NewZapBuilderPage`:
  - Executes isolated step test via `POST /zaps/test-step`.
  - Formats step JSON outputs into a structured Key-Value Table instead of raw pre-formatted JSON, making output fields visually scannable for variable mapping.

## Verification
- Pushed to GitHub with one-liner commit messages for each milestone.
