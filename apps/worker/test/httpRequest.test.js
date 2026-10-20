// Custom HTTP request step: templating, response handling and the private-address guard.
// MOCKED: fetch and DNS are fakes; no network.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { executeHttpRequest, resolveUrl, buildBody, assertPublicUrl, isPrivateAddress } = require("../src/integrations/http/request");
const { isRetryable } = require("../src/recovery");

const context = { trigger: { issue: { title: 'Login "broken"', number: 42 }, url: "https://hooks.example.com/abc" }, steps: {} };

function fakeFetch(status = 200, responseBody = { ok: true }) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, ...opts });
    const text = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
  fn.calls = calls;
  return fn;
}

test("URL: values are URL-encoded; a leading placeholder can hold a whole base URL", () => {
  assert.equal(resolveUrl("https://api.example.com/search?q={{trigger.issue.title}}", context), "https://api.example.com/search?q=Login%20%22broken%22");
  assert.equal(resolveUrl("{{trigger.url}}?n={{trigger.issue.number}}", context), "https://hooks.example.com/abc?n=42");
});

test("JSON body: data with quotes can't break the JSON", () => {
  const body = buildBody('{"title": "{{trigger.issue.title}}", "n": "{{trigger.issue.number}}"}', context);
  assert.equal(body.contentType, "application/json");
  assert.deepEqual(JSON.parse(body.text), { title: 'Login "broken"', n: "42" });
  assert.deepEqual(JSON.parse(buildBody({ nested: { t: "#{{trigger.issue.number}}" } }, context).text), { nested: { t: "#42" } });
});

test("body that only becomes JSON after filling in, and plain text, are sent as written", () => {
  const numeric = buildBody('{"n": {{trigger.issue.number}}}', context);
  assert.deepEqual({ text: numeric.text, type: numeric.contentType }, { text: '{"n": 42}', type: "application/json" });
  assert.equal(buildBody("Issue {{trigger.issue.number}}", context).contentType, "text/plain; charset=utf-8");
  assert.equal(buildBody("", context), null);
});

test("request is sent with the filled-in URL/body; output has status and parsed body", async () => {
  const f = fakeFetch(201, { id: 7 });
  const result = await executeHttpRequest({ method: "post", url: "https://api.example.com/items/{{trigger.issue.number}}", body: '{"t":"{{trigger.issue.title}}"}' }, context, { fetchImpl: f, allowPrivate: true });
  assert.equal(f.calls[0].url, "https://api.example.com/items/42");
  assert.equal(f.calls[0].method, "POST");
  assert.equal(f.calls[0].headers["Content-Type"], "application/json");
  assert.deepEqual(result.output, { status: 201, body: { id: 7 } });
});

test("GET sends no body; non-JSON responses are kept as text", async () => {
  const f = fakeFetch(200, "pong");
  const result = await executeHttpRequest({ method: "GET", url: "https://api.example.com/ping", body: '{"x":1}' }, context, { fetchImpl: f, allowPrivate: true });
  assert.equal(f.calls[0].body, undefined);
  assert.equal(result.output.body, "pong");
});

test("error statuses fail the step; only 429/5xx-gateway are retryable; query string not in the message", async () => {
  const err500 = await executeHttpRequest({ url: "https://api.example.com/x?api_key=SECRET" }, context, { fetchImpl: fakeFetch(500, { error: "boom" }), allowPrivate: true }).catch((e) => e);
  assert.match(err500.message, /returned 500/);
  assert.doesNotMatch(err500.message, /SECRET/);
  assert.equal(isRetryable(err500), false);
  const err503 = await executeHttpRequest({ url: "https://api.example.com/x" }, context, { fetchImpl: fakeFetch(503, "busy"), allowPrivate: true }).catch((e) => e);
  assert.equal(isRetryable(err503), true);
});

test("private and internal addresses are recognised", () => {
  for (const a of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateAddress(a), true, a);
  }
  for (const a of ["8.8.8.8", "140.82.112.3", "2606:4700::1111"]) assert.equal(isPrivateAddress(a), false, a);
});

test("guard: blocks hosts that resolve to private addresses, and non-http URLs", async () => {
  const lookup = async (host) => (host === "internal.corp" ? [{ address: "10.0.0.5" }] : [{ address: "93.184.216.34" }]);
  await assert.rejects(assertPublicUrl("http://internal.corp/admin", lookup), /private or internal/);
  await assert.rejects(assertPublicUrl("http://169.254.169.254/latest/meta-data", lookup), /private or internal/);
  await assert.rejects(assertPublicUrl("http://[::1]:4000/", lookup), /private or internal/);
  await assert.rejects(assertPublicUrl("file:///etc/passwd", lookup), /only http and https/);
  await assertPublicUrl("https://example.com/hook", lookup);

  const f = fakeFetch();
  await assert.rejects(executeHttpRequest({ url: "http://localhost:4000/zaps" }, context, { fetchImpl: f, allowPrivate: false, lookup: async () => [{ address: "127.0.0.1" }] }), /private or internal/);
  assert.equal(f.calls.length, 0, "nothing was sent");
});

test("missing or invalid URL is a clear error", async () => {
  await assert.rejects(executeHttpRequest({ url: "" }, context, { fetchImpl: fakeFetch(), allowPrivate: true }), /no URL/);
  await assert.rejects(executeHttpRequest({ url: "{{trigger.missing}}/x" }, context, { fetchImpl: fakeFetch(), allowPrivate: true }), /not a valid URL/);
});
