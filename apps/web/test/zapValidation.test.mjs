// Unit tests for pre-publish validation (pure function, no browser or network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateZapForPublish } from "../src/lib/zapValidation.js";

const ghTrigger = (extra = {}) => ({ type: "POLLING", config: { provider: "github", event: "new_issue", repo: "o/r", connectionId: "c_gh", ...extra } });
const slackStep = (extra = {}) => ({ type: "ACTION", config: { provider: "slack", action: "send_message", connectionId: "c_sl", config: { channel: "C1", text: "hi" }, ...extra } });

test("valid GitHub -> Slack zap passes", () => {
  assert.equal(validateZapForPublish({ trigger: ghTrigger(), steps: [slackStep()] }), null);
});

test("GitHub trigger without an account is rejected (poller would call GitHub unauthenticated)", () => {
  assert.match(validateZapForPublish({ trigger: ghTrigger({ connectionId: null }), steps: [slackStep()] }), /GitHub account/);
});

test("trigger account can come from top-level connectionId (Gmail/Slack trigger panels)", () => {
  const trigger = { type: "POLLING", connectionId: "c_g", config: { provider: "gmail", event: "new_email" } };
  assert.equal(validateZapForPublish({ trigger, steps: [slackStep()] }), null);
});

test("GitHub trigger without a repo and Slack trigger without a channel are rejected", () => {
  assert.match(validateZapForPublish({ trigger: ghTrigger({ repo: "" }), steps: [] }), /repository/);
  const slackTrigger = { type: "POLLING", config: { provider: "slack", event: "new_message", connectionId: "c" } };
  assert.match(validateZapForPublish({ trigger: slackTrigger, steps: [] }), /Slack channel/);
});

test("action steps need an app, an action and an account", () => {
  assert.match(validateZapForPublish({ trigger: ghTrigger(), steps: [{ type: "ACTION", config: {} }] }), /Step 2: Choose an app for this step/);
  assert.match(validateZapForPublish({ trigger: ghTrigger(), steps: [slackStep({ action: "" })] }), /Step 2: Choose a Slack action/);
  assert.match(validateZapForPublish({ trigger: ghTrigger(), steps: [slackStep(), slackStep({ connectionId: null })] }), /Step 3: Choose a Slack account/);
});

test("required fields must be filled before publishing (same rule as the Ready badge)", () => {
  const getAction = () => ({ fields: [{ key: "channel", label: "Channel", required: true }, { key: "text", label: "Message Text", required: true }] });
  const empty = slackStep({ config: { channel: "", text: " " } });
  assert.equal(validateZapForPublish({ trigger: ghTrigger(), steps: [empty] }, { getAction }), "Step 2: Fill in Channel and Message Text.");
  assert.equal(validateZapForPublish({ trigger: ghTrigger(), steps: [slackStep()] }, { getAction }), null);
});

test("a trigger with no app chosen, and empty Filter/Loop/HTTP steps, are rejected", () => {
  assert.match(validateZapForPublish({ trigger: { type: "WEBHOOK", config: {} }, steps: [slackStep()] }), /Trigger: Choose the app and event/);
  const webhook = { type: "WEBHOOK", config: { provider: "webhook", event: "catch_hook" } };
  assert.match(validateZapForPublish({ trigger: webhook, steps: [{ type: "FILTER", config: { path: "" } }] }), /Step 2: Choose the field/);
  assert.match(validateZapForPublish({ trigger: webhook, steps: [{ type: "LOOP", config: { arrayPath: "" }, steps: [] }] }), /Step 2: Choose the list/);
  assert.match(validateZapForPublish({ trigger: webhook, steps: [{ type: "ACTION", config: { url: "" } }] }), /Step 2: Enter the URL/);
});

test("webhook trigger and custom HTTP step need no account", () => {
  const trigger = { type: "WEBHOOK", config: { provider: "webhook", event: "catch_hook" } };
  assert.equal(validateZapForPublish({ trigger, steps: [{ type: "ACTION", config: { url: "https://example.com" } }] }), null);
});
