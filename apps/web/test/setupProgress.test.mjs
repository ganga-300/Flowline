// The step drawer's progress strip and the sample-data path helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canTest, findListPaths, findValuePaths, setupStages } from "../src/features/zap-builder/setupProgress.js";

const ids = (stages) => stages.map((s) => `${s.id}${s.done ? "✓" : ""}`);
const slackAction = { fields: [{ key: "channel", required: true }, { key: "text", required: true }, { key: "emoji", required: false }] };

test("app action: App & event → Account → Configure → Test, ticked as each is filled", () => {
  const getAction = () => slackAction;
  const draft = (config) => ({ type: "ACTION", config: { provider: "slack", ...config } });
  assert.deepEqual(ids(setupStages({ draft: draft({}), getAction })), ["app", "account", "configure", "test"]);
  const ready = draft({ action: "send_message", connectionId: "c1", config: { channel: "C1", text: "hi" } });
  assert.deepEqual(ids(setupStages({ draft: ready, getAction, tested: true })), ["app✓", "account✓", "configure✓", "test✓"]);
  const missingText = draft({ action: "send_message", connectionId: "c1", config: { channel: "C1", text: "  " } });
  assert.deepEqual(ids(setupStages({ draft: missingText, getAction })), ["app✓", "account✓", "configure", "test"]);
});

test("built-in apps and HTTP requests have no account stage", () => {
  assert.deepEqual(ids(setupStages({ draft: { type: "ACTION", config: { provider: "formatter", action: "capitalize_text" } } })), ["app✓", "configure✓", "test"]);
  assert.deepEqual(ids(setupStages({ draft: { type: "ACTION", config: { url: "https://x.test" } } })), ["configure✓", "test"]);
});

test("triggers: account and the app's own setting for OAuth apps; webhooks just pick the event", () => {
  const gh = { type: "POLLING", config: { provider: "github", event: "new_issue", connectionId: "c", repo: "o/r" } };
  assert.deepEqual(ids(setupStages({ isTrigger: true, draft: gh })), ["app✓", "account✓", "configure✓", "test"]);
  assert.deepEqual(ids(setupStages({ isTrigger: true, draft: { config: { provider: "webhook", event: "catch_hook" } } })), ["app✓", "test"]);
});

test("Paths, Loop and Delay have one setup stage and no test", () => {
  const paths = (conditions) => ({ type: "BRANCH", config: {}, paths: conditions.map((c) => ({ condition: c })) });
  assert.deepEqual(ids(setupStages({ draft: paths([{ path: "trigger.x" }, null]) })), ["configure✓"]);
  assert.deepEqual(ids(setupStages({ draft: paths([{ path: "" }, null]) })), ["configure"]);
  assert.deepEqual(ids(setupStages({ draft: paths([null]) })), ["configure"], "a fallback alone isn't a split");
  assert.deepEqual(ids(setupStages({ draft: { type: "LOOP", config: { arrayPath: "trigger.items" } } })), ["configure✓"]);
  assert.equal(canTest(false, "LOOP"), false);
  assert.equal(canTest(false, "FILTER"), true);
  assert.equal(canTest(true, undefined), true);
});

test("sample helpers find lists (for Loop) and values (for rules)", () => {
  const sample = { body: { items: [{ id: 1 }], user: { name: "Ana", tags: ["a"] } }, count: 2 };
  assert.deepEqual(findListPaths(sample), ["trigger.body.items", "trigger.body.user.tags"]);
  assert.deepEqual(findValuePaths(sample), ["trigger.body.items", "trigger.body.user.name", "trigger.body.user.tags", "trigger.count"]);
});
