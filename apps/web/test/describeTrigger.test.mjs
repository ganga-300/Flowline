// Readable trigger summaries on dashboard cards (pure function).
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeTrigger } from "../src/features/zaps/describeTrigger.js";

test("GitHub trigger shows the event and repository", () => {
  assert.deepEqual(describeTrigger({ type: "POLLING", config: { provider: "github", event: "new_push", repo: "octo/demo" } }),
    { app: "github", appName: "GitHub", event: "New Code Push", detail: "octo/demo" });
});

test("Gmail trigger shows its search query, or 'Any new email'", () => {
  assert.equal(describeTrigger({ config: { provider: "gmail", event: "new_email", query: "subject:invoice" } }).detail, 'Matching "subject:invoice"');
  assert.equal(describeTrigger({ config: { provider: "gmail", event: "new_email" } }).detail, "Any new email");
});

test("Slack trigger never shows a raw channel id", () => {
  const d = describeTrigger({ config: { provider: "slack", event: "new_message", channel: "C0123ABC" } });
  assert.equal(d.event, "New Message in Channel");
  assert.equal(d.detail, "Selected channel");
});

test("webhook and missing triggers have sensible labels", () => {
  assert.equal(describeTrigger({ type: "WEBHOOK", config: {} }).appName, "Webhooks");
  assert.equal(describeTrigger(null).event, "No trigger");
});
