// Apps directory (/connections): catalog, search, status filter and labels (pure functions).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountLabel, appStatus, buildAppCatalog, capabilitySummary, connectedLabel, disconnectWarning, filterApps,
  groupConnections, matchApp, statusCounts, usageText, zapNameList,
  brokenCount, disconnectedMessage, needsReconnect, reconnectMessage,
} from "../src/features/connections/appsDirectory.js";

const slack = {
  id: "slack", name: "Slack", description: "Send channel messages",
  triggers: [{ id: "new_message", name: "New Message in Channel", description: "Triggers when a message is posted", fields: [] }],
  actions: [
    { id: "send_message", name: "Send Channel Message", description: "Posts a message to a Slack channel", fields: [] },
    { id: "send_dm", name: "Send Direct Message", description: "Sends a direct message to a user", fields: [] },
  ],
};
const gmail = {
  id: "gmail", name: "Gmail", description: "Email",
  triggers: [{ id: "new_email", name: "New Email Received", description: "A new email arrives" }],
  actions: [{ id: "send_email", name: "Send Email", description: "Sends an email" }],
};
const apps = buildAppCatalog([slack, gmail]);
const byApp = groupConnections([
  { id: "c1", provider: "slack", email: "Acme" },
  { id: "c2", provider: "slack", email: "Beta" },
]);
const ids = (rows) => rows.map((r) => r.app.id);

test("catalog: OAuth apps first, then built-in Webhooks, Formatter and Math", () => {
  assert.deepEqual(apps.map((a) => [a.id, a.kind]), [
    ["slack", "oauth"], ["gmail", "oauth"], ["webhook", "builtin"], ["formatter", "builtin"], ["math", "builtin"],
  ]);
  const webhook = apps.find((a) => a.id === "webhook");
  assert.equal(webhook.triggers[0].name, "Catch Webhook Event");
  assert.equal(webhook.actions[0].name, "HTTP request");
  assert.equal(apps.find((a) => a.id === "formatter").name, "Formatter", "drops the 'by Flowline' suffix");
  assert.ok(apps.every((a) => a.purpose), "every app has a one-line purpose");
  assert.equal(apps[0].actions[0].fields, undefined, "only display fields are kept");
});

test("search matches app names case-insensitively", () => {
  assert.deepEqual(ids(filterApps(apps, { query: "SLA" }, byApp)), ["slack"]);
  assert.deepEqual(matchApp(apps[0], "slack"), { field: "app" });
});

test("search matches trigger and action text, and says which one matched", () => {
  assert.deepEqual(ids(filterApps(apps, { query: "direct message" }, byApp)), ["slack"]);
  assert.deepEqual(matchApp(apps[0], "direct message"), { field: "action", name: "Send Direct Message" });
  assert.deepEqual(matchApp(apps[1], "new email"), { field: "trigger", name: "New Email Received" });
  assert.deepEqual(ids(filterApps(apps, { query: "regex" }, byApp)), ["formatter"]);
});

test("every search word must match somewhere; no match returns nothing", () => {
  assert.equal(matchApp(apps[0], "slack email"), null);
  assert.deepEqual(filterApps(apps, { query: "zzz" }, byApp), []);
  assert.equal(filterApps(apps, { query: "   " }, byApp).length, apps.length, "blank search shows everything");
});

test("status filter: built-in apps only appear under All", () => {
  assert.deepEqual(ids(filterApps(apps, { status: "connected" }, byApp)), ["slack"]);
  assert.deepEqual(ids(filterApps(apps, { status: "not_connected" }, byApp)), ["gmail"]);
  assert.deepEqual(ids(filterApps(apps, { status: "not_connected", query: "slack" }, byApp)), []);
  assert.equal(appStatus(apps[2], byApp), "builtin");
  assert.deepEqual(statusCounts(apps, byApp), { all: 5, connected: 1, not_connected: 1 });
});

test("labels: connected count, GitHub @login, Flow usage", () => {
  assert.equal(capabilitySummary(apps[0]), "1 trigger · 2 actions");
  assert.equal(capabilitySummary(apps.find((a) => a.id === "math")), "1 action");
  assert.equal(connectedLabel(1), "Connected · 1 account");
  assert.equal(connectedLabel(3), "Connected · 3 accounts");
  assert.equal(accountLabel("github", { email: "octocat" }), "@octocat");
  assert.equal(accountLabel("github", { email: "github Account (abc123)" }), "github Account (abc123)");
  assert.equal(accountLabel("slack", { email: "Acme" }), "Acme");
  assert.equal(usageText(undefined), null, "older API without usedBy: say nothing");
  assert.equal(usageText([]), "Not used in any Flows");
  assert.equal(usageText([{ zapId: "z1", zapName: "A" }]), "Used in 1 Flow");
  assert.equal(usageText([{}, {}]), "Used in 2 Flows");
});

test("disconnect warning names the Flows that will stop working", () => {
  const zaps = (...names) => names.map((zapName, i) => ({ zapId: `z${i}`, zapName }));
  assert.equal(zapNameList(zaps("A")), "“A”");
  assert.equal(zapNameList(zaps("A", "B")), "“A” and “B”");
  assert.equal(zapNameList(zaps("A", "B", "C", "D", "E")), "“A”, “B”, “C” and 2 more");
  assert.equal(disconnectWarning("Slack", zaps("Digest")), "“Digest” uses this account. Disconnecting turns it off until you choose another Slack account for it.");
  assert.match(disconnectWarning("Slack", zaps("A", "B")), /^“A” and “B” use this account\. Disconnecting turns them off/);
  assert.equal(disconnectWarning("Slack", []), "No Flows use this Slack account right now.");
  assert.match(disconnectWarning("Slack", undefined), /Flows that use this Slack account are turned off/);
});

test("disconnect warning names only the Flows that are on (the server turns those off)", () => {
  const usedBy = [{ zapId: "1", zapName: "A", status: "ENABLED" }, { zapId: "2", zapName: "B", status: "DISABLED" }];
  assert.equal(disconnectWarning("Gmail", usedBy), "“A” and “B” use this account. Disconnecting turns off “A” until you choose another Gmail account for it.");
  assert.equal(disconnectWarning("Gmail", [usedBy[1]]), "“B” uses this account. It will need another Gmail account before running again.");
});

test("after disconnecting, the toast says which Flows were turned off", () => {
  assert.equal(disconnectedMessage("Slack", []), "Slack account disconnected.");
  assert.equal(disconnectedMessage("Slack"), "Slack account disconnected.");
  assert.equal(
    disconnectedMessage("Slack", [{ zapId: "1", zapName: "Digest" }]),
    "Slack account disconnected. Turned off “Digest”: choose another Slack account in it, then turn it back on."
  );
  assert.match(disconnectedMessage("Slack", [{ zapName: "A" }, { zapName: "B" }]), /Turned off “A” and “B”: .* in them, then turn them back on\.$/);
});

test("accounts the app stopped accepting are flagged for reconnecting", () => {
  const ok = { id: "a", status: "OK" };
  const broken = { id: "b", status: "NEEDS_RECONNECT", lastErrorAt: "2026-11-18T10:00:00Z" };
  assert.equal(needsReconnect(ok), false);
  assert.equal(needsReconnect({ id: "old" }), false, "older API without a status: OK");
  assert.equal(needsReconnect(broken), true);
  assert.equal(brokenCount([ok, broken, broken]), 2);
  assert.equal(brokenCount(), 0);
  assert.equal(reconnectMessage("Slack", broken), "Slack stopped accepting this account on Nov 18, 2026. Flows that use it can't run until you reconnect it.");
  assert.match(reconnectMessage("Slack", { status: "NEEDS_RECONNECT" }), /^Slack stopped accepting this account\. /);
});
