// Builder card text and new-step defaults (pure functions).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStep, describeStepCard, describeTriggerCard, formatSeconds, stepEyebrow } from "../src/features/zap-builder/stepTypes.js";

const registry = {
  getIntegration: (id) => ({ slack: { name: "Slack" }, github: { name: "GitHub" } })[id] || null,
  getIntegrationAction: (p, a) => (p === "slack" && a === "send_message" ? { name: "Send Channel Message" } : null),
};

test("new steps start unconfigured with sensible defaults", () => {
  assert.deepEqual(createStep("DELAY", "s1"), { id: "s1", type: "DELAY", name: "Delay", config: { seconds: 30 }, isConfigured: false });
  assert.deepEqual(createStep("FILTER", "s2").config, { path: "", operator: "EQUALS", value: "" });
  assert.equal(createStep("ACTION", "s3").name, "Choose an app");
});

test("trigger card: placeholder until configured, then event and detail", () => {
  assert.equal(describeTriggerCard({ config: { provider: "webhook" }, isConfigured: false }).title, "Choose a trigger");
  assert.deepEqual(
    describeTriggerCard({ config: { provider: "github", event: "new_issue", repo: "octo/demo" }, isConfigured: true }),
    { app: "github", title: "New Issue Created", summary: "GitHub · octo/demo" }
  );
  assert.equal(describeTriggerCard({ config: { provider: "gmail", event: "new_email" }, isConfigured: true }).summary, "Gmail · any new email");
});

test("action cards show the app's action, or ask for one", () => {
  assert.deepEqual(
    describeStepCard({ type: "ACTION", isConfigured: true, config: { provider: "slack", action: "send_message" } }, registry),
    { app: "slack", title: "Send Channel Message", summary: "Slack" }
  );
  assert.equal(describeStepCard({ type: "ACTION", config: { provider: "slack", action: "send_message" } }, registry).summary, "Slack · needs setup");
  assert.equal(describeStepCard({ type: "ACTION", config: {} }, registry).title, "Choose an app");
  assert.equal(describeStepCard({ type: "ACTION", config: { url: "https://x.dev/hook", method: "PUT" } }).summary, "PUT https://x.dev/hook");
});

test("filter, delay and AI summaries read as sentences", () => {
  assert.equal(describeStepCard({ type: "FILTER", name: "Bugs", config: { path: "trigger.issue.title", operator: "CONTAINS", value: "bug" } }).summary, 'Only continue if trigger.issue.title contains "bug"');
  assert.equal(describeStepCard({ type: "FILTER", config: { path: "trigger.email.from", operator: "EXISTS" } }).summary, "Only continue if trigger.email.from exists");
  assert.equal(describeStepCard({ type: "DELAY", config: { seconds: "120" } }).summary, "Wait 2 minutes");
  assert.equal(describeStepCard({ type: "AI", config: { prompt: "" } }).summary, "Write the prompt");
});

test("eyebrows and durations", () => {
  assert.equal(stepEyebrow("POLLING"), "Trigger");
  assert.equal(stepEyebrow("ACTION"), "Action");
  assert.equal(stepEyebrow("DELAY"), "Delay");
  assert.equal(formatSeconds(1), "1 second");
  assert.equal(formatSeconds(90), "90 seconds");
  assert.equal(formatSeconds(3600), "1 hour");
});
