# Milestone 21: 1-Click Instant Runs, Slack & GitHub OAuth Integrations

**Date:** 2026-09-13

## What was built

### 1-Click Instant Run Engine
- Implemented `POST /zaps/:id/run` on the backend (`apps/server/src/routes/zaps.js`) allowing users to trigger any Zap workflow on demand without needing external webhooks, curl commands, or polling delays.
- Added a prominent **`▶ Run Now`** button with interactive running state indicators and success toast notifications to every Zap card on the Dashboard (`apps/web/src/app/dashboard/page.js`).

### Non-Technical Zapier-Style UX
- Fully removed technical jargon (`WEBHOOK`, `POLLING`, `Catch Webhook Event`, raw JSON payloads) across the entire UI canvas and side panels.
- Replaced cards with intuitive step headers: **`01. WHEN THIS HAPPENS`** and **`02. THEN DO THIS`**.

### Slack OAuth & Channel Messaging Integration
- Built dedicated Slack OAuth 2.0 connection routes (`GET /connections/slack/start` and `GET /connections/slack/callback`).
- Added 1-click **"Connect Slack"** button on the Connections page.
- Implemented Slack `send_message` action handler (`apps/worker/src/integrations/slack/sendMessage.js`) supporting automated OAuth access token authorization and channel selection.
- Supported dynamic Slack channel fetching (`GET /connections/:id/options?type=slack_channels`).

### GitHub OAuth & Issue Automation Integration
- Built dedicated GitHub OAuth 2.0 connection routes (`GET /connections/github/start` and `GET /connections/github/callback`).
- Added 1-click **"Connect GitHub"** button on the Connections page.
- Implemented GitHub `create_issue` action handler (`apps/worker/src/integrations/github/createIssue.js`) supporting repository selection, dynamic issue titles, and markdown descriptions.
- Added dynamic repository listing (`GET /connections/:id/options?type=github_repos`).

## Verification
- Verified production compilation across all web routes with `npm run build`.
- Tested isolated action executions and verified database step execution logging.
