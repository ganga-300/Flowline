# Milestone 22: Core Integrations Polish & Streamlined Builder UX

**Date:** 2026-10-16

## What was done

### 1. 3-Integration Core Scope (Gmail, Slack, GitHub)
- Strictly scoped the entire application to the three core integrations: **Gmail**, **Slack**, and **GitHub**.
- Cleaned up unused registries, routes, and dead integration references across client, server, and worker.

### 2. Builder Stability & UX Fixes
- **Removed Phantom Steps**: Removed unhandled Formatter and Loop buttons from the step selector popover.
- **Data-Loss Prevention**: Kept "Save Step" button visible across both Setup and Test tabs.
- **Trigger Test Tab**: Fixed the trigger drawer's Test tab to display sample payload data previews instead of attempting direct execution.
- **Clean Dashboard Cards**: Removed internal Zap ID strings from dashboard cards.
- **Dynamic Slack Trigger Channel**: Switched Slack trigger channel input from a raw text box to a dynamic channel dropdown.
- **GitHub Defaults**: Removed hardcoded `"openfoodfacts"` default from the repository selector, prioritizing the authenticated user's personal repositories.

### 3. Smart Templates & One-Click Variable Chips
- **1-Click Variable Chips**: Added clickable chips (`[+ Issue Title]`, `[+ Issue URL]`, `[+ Issue #]`, `[+ Author]`, etc.) above text inputs — eliminating the need to type code-like `{{...}}` brackets manually.
- **`✨ Use Default Template`**: Added a one-click button for Slack and Gmail notification actions to auto-fill a complete, formatted alert template.
- **Resilient Template Resolver**: Upgraded worker AST resolution (`resolvePath`) to seamlessly resolve shorthand variables (`{{title}}`, `{{issue.title}}`, `{{number}}`) in addition to full paths.
- **Cleaned Placeholders**: Replaced raw code examples in input placeholders with user-friendly plain English prompts.

### 4. Dynamic OAuth Return Preservation
- Signed dynamic `returnUrl` directly into OAuth state tokens across Gmail, Slack, and GitHub.
- Connecting an account from inside `/zaps/new` now redirects directly back to `/zaps/new`, keeping in-progress workflow drafts intact and auto-binding the newly connected account.

### 5. Instant Live Polling on Manual Run
- Enhanced `POST /zaps/:id/run` to execute live trigger polling immediately for GitHub, Gmail, and Slack, allowing real-time event checks without waiting for the 5-minute background cron cycle.
