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
  assert.match(validateZapForPublish({ trigger: ghTrigger(), steps: [{ type: "ACTION", config: {} }] }), /Step 1 is incomplete/);
  assert.match(validateZapForPublish({ trigger: ghTrigger(), steps: [slackStep({ action: "" })] }), /Step 1: please choose a Slack action/);
  assert.match(validateZapForPublish({ trigger: ghTrigger(), steps: [slackStep(), slackStep({ connectionId: null })] }), /Step 2: please choose a Slack account/);
});

test("webhook trigger and custom HTTP step need no account", () => {
  const trigger = { type: "WEBHOOK", config: { provider: "webhook", event: "catch_hook" } };
  assert.equal(validateZapForPublish({ trigger, steps: [{ type: "ACTION", config: { url: "https://example.com" } }] }), null);
});
