// Dashboard helpers: accounts needing a reconnect and each Flow's latest run (pure functions).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountName, accountsNeedingReconnect, lastRunSummary, reconnectBanner, reconnectHref, zapReconnectWarning,
} from "../src/features/zaps/zapHealth.js";

const slack = { connectionId: "c1", app: "slack", account: "Acme", lastError: "token_revoked" };
const github = { connectionId: "c2", app: "github", account: "octo", lastError: null };
const zaps = [
  { id: "z1", zapName: "Digest", brokenConnections: [slack] },
  { id: "z2", zapName: "Issues to Slack", brokenConnections: [github, slack] },
  { id: "z3", zapName: "Fine", brokenConnections: [] },
  { id: "z4", zapName: "Older API" },
];

test("account names as people know them", () => {
  assert.equal(accountName(slack), "Slack (Acme)");
  assert.equal(accountName(github), "GitHub (@octo)");
  assert.equal(accountName({ app: "gmail", account: "" }), "Gmail");
});

test("each broken account is listed once with the Flows that use it", () => {
  assert.deepEqual(accountsNeedingReconnect(zaps), [
    { connectionId: "c1", app: "slack", account: "Acme", zapNames: ["Digest", "Issues to Slack"] },
    { connectionId: "c2", app: "github", account: "octo", zapNames: ["Issues to Slack"] },
  ]);
  assert.deepEqual(accountsNeedingReconnect([]), []);
});

test("the dashboard banner says which account and how many Flows are stuck", () => {
  assert.equal(reconnectBanner([]), null);
  const one = reconnectBanner(accountsNeedingReconnect([zaps[0]]));
  assert.equal(one.title, "Slack (Acme) needs reconnecting");
  assert.equal(one.body, "Slack stopped accepting it, so 1 Flow can't run until you reconnect.");
  const two = reconnectBanner(accountsNeedingReconnect(zaps));
  assert.equal(two.title, "2 connected accounts need reconnecting");
  assert.equal(two.body, "The apps stopped accepting them, so 2 Flows can't run until you reconnect.");
});

test("a Flow's card warns about its own broken accounts and links to that app", () => {
  assert.equal(zapReconnectWarning(zaps[1]), "Reconnect GitHub (@octo) and Slack (Acme): this Flow can't run until you do.");
  assert.equal(zapReconnectWarning(zaps[2]), null);
  assert.equal(zapReconnectWarning(zaps[3]), null);
  assert.equal(reconnectHref(zaps[1]), "/connections?app=github");
  assert.equal(reconnectHref(zaps[2]), "/connections");
});

test("last run: status, when, a link to that run, and whether the Flow is failing", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  const failed = lastRunSummary({ id: "z1", lastRun: { id: "r1", status: "FAILED", createdAt: "2026-11-18T11:55:00Z" } }, now);
  assert.deepEqual(failed, { tone: "danger", label: "Failed", when: "5 min ago", href: "/flows/z1/runs?run=r1", failing: true });
  assert.equal(lastRunSummary({ id: "z1", lastRun: { id: "r2", status: "SUCCESS", createdAt: "2026-11-18T11:59:50Z" } }, now).failing, false);
  assert.equal(lastRunSummary({ id: "z1", lastRun: null }), null);
  assert.equal(lastRunSummary({ id: "z1" }), null);
});
