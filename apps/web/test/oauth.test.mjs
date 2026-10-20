// OAuth start URL and return-result parsing (pure functions).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOAuthStartUrl, readOAuthResult } from "../src/lib/oauth.js";

test("start URL carries the token and where to come back to, encoded", () => {
  const url = new URL(buildOAuthStartUrl({ apiBase: "http://api.test", provider: "slack", token: "a.b.c", returnPath: "/zaps/1/edit?x=1" }));
  assert.equal(url.origin + url.pathname, "http://api.test/connections/slack/start");
  assert.equal(url.searchParams.get("token"), "a.b.c");
  assert.equal(url.searchParams.get("returnUrl"), "/zaps/1/edit?x=1");
});

test("reads success, error, or nothing from the return URL", () => {
  assert.deepEqual(readOAuthResult("?connected=github&connectionId=c1"), { tone: "success", provider: "github" });
  assert.deepEqual(readOAuthResult("?error=bad_client_secret"), { tone: "danger", message: "bad_client_secret" });
  assert.equal(readOAuthResult(""), null);
});
