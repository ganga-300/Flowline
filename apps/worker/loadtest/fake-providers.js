/**
 * TEST ONLY - stands in for the GitHub, Slack and Gmail APIs during load and crash tests,
 * so no real account is touched. Load it with:  node -r ./loadtest/fake-providers.js src/index.js
 * It does nothing unless FAKE_PROVIDERS=1.
 *
 * Every request the worker sends is appended as one JSON line to FAKE_PROVIDER_LOG at the
 * moment the "provider receives" it - halfway through FAKE_PROVIDER_LATENCY_MS. A crash can
 * therefore land before the provider got the request, or after it (response lost), like in
 * production. crash-test.js counts these lines to find duplicates.
 * FAKE_FAIL_COMMENTS_FILE: while that file exists, "add comment" fails (used by retry-test.js).
 */
if (process.env.FAKE_PROVIDERS === "1") {
  const fs = require("fs");
  const logFile = process.env.FAKE_PROVIDER_LOG || "fake-provider.log";
  const latencyMs = Number(process.env.FAKE_PROVIDER_LATENCY_MS || 0);
  const realFetch = global.fetch;
  const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
  let counter = 0;

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!/api\.github\.com|slack\.com\/api|googleapis\.com/.test(u)) return realFetch(url, opts);

    await sleep(latencyMs / 2); // request travelling to the provider
    let body = null;
    try { body = opts.body ? JSON.parse(opts.body) : null; } catch { body = opts.body; }
    // retry-test.js: while FAKE_FAIL_COMMENTS_FILE exists, comments fail like a missing issue
    // (404 - not retryable), so the run fails at step 2. Not logged: nothing was created.
    if (/\/comments$/.test(u) && process.env.FAKE_FAIL_COMMENTS_FILE && fs.existsSync(process.env.FAKE_FAIL_COMMENTS_FILE)) {
      return json(404, { message: "Not Found" });
    }
    fs.appendFileSync(logFile, JSON.stringify({ t: Date.now(), pid: process.pid, method: opts.method || "GET", url: u, body }) + "\n");
    await sleep(latencyMs / 2); // response travelling back

    counter += 1;
    if (/api\.github\.com\/repos\/.+\/issues$/.test(u)) {
      return json(201, { number: counter, html_url: `https://github.com/fake/repo/issues/${counter}`, title: body?.title });
    }
    if (/api\.github\.com\/repos\/.+\/issues\/\d+\/comments$/.test(u)) {
      return json(201, { id: counter, html_url: `https://github.com/fake/repo/issues/1#issuecomment-${counter}` });
    }
    if (u.includes("slack.com/api/chat.postMessage")) return json(200, { ok: true, ts: `${Date.now() / 1000}`, channel: body?.channel });
    if (u.includes("gmail.googleapis.com") && u.endsWith("/messages/send")) return json(200, { id: `m${counter}`, threadId: `t${counter}` });
    return json(404, { message: `fake-providers: no fake for ${u}` });
  };
  console.log(`[fake-providers] active: provider requests logged to ${logFile} (latency ${latencyMs}ms)`);
}
