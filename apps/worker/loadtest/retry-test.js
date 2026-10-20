/**
 * TEST ONLY - checks "Retry from failed step" against a real database, Redis, server and
 * worker, with fake GitHub (fake-providers.js) so no real account is touched.
 * Zap from setup-bench-zap.js: Webhook -> GitHub Create Issue -> GitHub Add Comment.
 *  1. Comments fail -> the run fails at step 2 after step 1 created the issue.
 *  2. Comments work again -> "Retry from failed step": the issue must NOT be created again,
 *     the comment must be posted once, on the issue from the original run.
 *  3. Same failure -> "Run all steps again": the issue IS created a second time (control).
 * Env: BENCH_FILE (setup-bench-zap.js output), FAKE_PROVIDER_LOG, FAKE_FAIL_COMMENTS_FILE, API_URL.
 */
const fs = require("fs");
const API = process.env.API_URL || "http://localhost:4000";
const bench = JSON.parse(fs.readFileSync(process.env.BENCH_FILE, "utf8"));
const logFile = process.env.FAKE_PROVIDER_LOG;
const failFlag = process.env.FAKE_FAIL_COMMENTS_FILE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = "GET", body, auth = true } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(auth && { Authorization: `Bearer ${bench.token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function waitForRun(runId) {
  for (let i = 0; i < 200; i++) {
    const { data } = await api(`/zaps/${bench.zapId}/runs/${runId}`);
    if (["SUCCESS", "FAILED", "FILTERED"].includes(data.run?.status)) return data.run;
    await sleep(100);
  }
  throw new Error(`run ${runId} did not finish`);
}

function providerCalls(seq) {
  const lines = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean) : [];
  const calls = lines.map((l) => JSON.parse(l));
  return {
    issues: calls.filter((c) => /\/issues$/.test(c.url) && c.body?.title === `bench ${seq}`),
    comments: calls.filter((c) => /\/comments$/.test(c.url) && String(c.body?.body || "").startsWith(`comment ${seq} `)),
  };
}

let failures = 0;
function expect(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function failedRun(seq) {
  fs.writeFileSync(failFlag, "1");
  const { data } = await api(`/webhooks/${bench.webhookToken}`, { method: "POST", auth: false, body: { seq, runTag: "retry" } });
  const run = await waitForRun(data.runId);
  fs.unlinkSync(failFlag);
  return run;
}

(async () => {
  // 1 + 2: retry from failed step
  const original = await failedRun("r1");
  const before = providerCalls("r1");
  expect("original run failed at the comment step", original.status === "FAILED", original.status);
  expect("original run created exactly one issue", before.issues.length === 1, `${before.issues.length}`);

  const retry = await api(`/zaps/${bench.zapId}/runs/${original.id}/retry`, { method: "POST", body: {} });
  expect("retry defaults to 'resume' for a failed run", retry.data.mode === "resume", retry.data.mode);
  const resumed = await waitForRun(retry.data.runId);
  const after = providerCalls("r1");
  expect("retried run succeeded", resumed.status === "SUCCESS", resumed.status);
  expect("issue was NOT created again", after.issues.length === 1, `issues: ${after.issues.length}`);
  expect("comment posted exactly once", after.comments.length === 1, `comments: ${after.comments.length}`);
  const [step1, step2] = resumed.stepExecutions;
  const originalIssue = original.stepExecutions[0]?.output?.issueNumber;
  const commentUrl = after.comments[0]?.url || "";
  expect("comment went to the issue from the original run", Boolean(originalIssue) && commentUrl.endsWith(`/issues/${originalIssue}/comments`), `issue #${originalIssue}, ${commentUrl}`);
  expect("step 1 is marked as reused from the original run", step1?.reusedFromRunId === original.id && step1?.status === "SUCCESS");
  expect("step 2 ran in the retry", step2?.status === "SUCCESS" && !step2?.reusedFromRunId);

  // 3: control - run all steps again
  const original2 = await failedRun("r2");
  const all = await api(`/zaps/${bench.zapId}/runs/${original2.id}/retry`, { method: "POST", body: { mode: "all" } });
  const rerun = await waitForRun(all.data.runId);
  const calls2 = providerCalls("r2");
  expect("'run all steps again' succeeded", rerun.status === "SUCCESS", rerun.status);
  expect("'run all steps again' creates the issue a second time (as warned in the UI)", calls2.issues.length === 2, `issues: ${calls2.issues.length}`);

  console.log(failures === 0 ? "\nAll retry checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
