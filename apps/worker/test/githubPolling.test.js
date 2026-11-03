// GitHub "New Issue" and "New Code Push" polling: every new issue/commit gets exactly one run,
// across pages; checkpoints survive deleted issues, force pushes and deleted commits.
// MOCKED: GitHub REST API (an in-memory repository with a real commit graph - parents,
// ancestors, compare ahead/behind/diverged - and Link-header pagination), Prisma, Redis/BullMQ.
// Proves our checkpoint logic - NOT GitHub's real limits.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const workerSrc = path.join(__dirname, "../src");
function stubModule(request, exports) {
  const resolved = require.resolve(request, { paths: [workerSrc] });
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// ── Queue and database fakes ──
let jobs, failOnQueue;
stubModule("bullmq", {
  Queue: class {
    async add(name, data, opts) {
      if (failOnQueue && failOnQueue(data)) throw new Error("simulated Redis failure");
      if (!jobs.has(opts.jobId)) jobs.set(opts.jobId, data);
    }
  },
});
stubModule("ioredis", class {});

let marker, markerWrites, runs;
stubModule(path.join(workerSrc, "prismaClient"), {
  trigger: { update: async ({ data }) => { marker = data.lastPollHash; markerWrites.push(marker); } },
  zapRun: {
    create: async ({ data }) => {
      if (runs.some((r) => r.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error("dup"), { code: "P2002" });
      const r = { id: `run_${runs.length + 1}`, ...data };
      runs.push(r);
      return r;
    },
    findUnique: async ({ where }) => runs.find((r) => r.idempotencyKey === where.idempotencyKey) || null,
  },
});

// ── Fake GitHub repository ──
let gh, calls, failRequest;
function resetRepo() {
  gh = { issues: [], nextIssueId: 5000, nextNumber: 1, commits: new Map(), head: null, seq: 0 };
}
/**
 * Opens an issue: the next number in this repo, a new id, created "now" (each issue a minute
 * after the last). createdAt: an older date (Issue Import API / transfers keep the original).
 * id: an existing id (an issue transferred in from another repo keeps its id).
 */
function openIssue({ title, pr = false, createdAt, id } = {}) {
  const created = createdAt || new Date(Date.UTC(2026, 0, 1) + gh.issues.length * 60_000).toISOString();
  const issue = { id: id ?? gh.nextIssueId++, number: gh.nextNumber++, title: title || `issue ${gh.nextNumber - 1}`, body: "", state: "open",
    html_url: `https://github.com/o/r/issues/${gh.nextNumber - 1}`, repository_url: "https://api.github.com/repos/o/r",
    user: { login: "alice" }, created_at: created };
  if (pr) issue.pull_request = { url: "x" };
  gh.issues.push(issue);
  return issue;
}
/** Creates a commit on top of `parents` (default: the current head) without moving the branch. */
function makeCommit(message, { parents = gh.head ? [gh.head] : [], ageSec = 0 } = {}) {
  const sha = `c${String(++gh.seq).padStart(4, "0")}`;
  gh.commits.set(sha, { sha, parents, seq: gh.seq, html_url: `https://github.com/o/r/commit/${sha}`,
    commit: { message, author: { name: "Alice", email: "a@example.com", date: new Date(Date.now() - ageSec * 1000).toISOString() } } });
  return sha;
}
/** git commit + git push (fast-forward) of n commits. */
function push(n, opts) {
  const shas = [];
  for (let i = 0; i < n; i++) {
    gh.head = makeCommit(`commit ${gh.seq + 1}`, opts);
    shas.push(gh.head);
  }
  return shas;
}
function ancestors(sha) {
  const seen = new Set();
  const stack = [sha];
  while (stack.length) {
    const s = stack.pop();
    if (seen.has(s) || !gh.commits.has(s)) continue;
    seen.add(s);
    stack.push(...gh.commits.get(s).parents);
  }
  return seen;
}
const publicCommit = (c) => ({ sha: c.sha, html_url: c.html_url, commit: c.commit, parents: c.parents.map((sha) => ({ sha })) });

function respond(status, body, { link, rateLimited } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (h) => (h.toLowerCase() === "link" ? link || null : h.toLowerCase() === "x-ratelimit-remaining" ? (rateLimited ? "0" : "4999") : null) },
  };
}
function paginate(items, u) {
  const perPage = Number(u.searchParams.get("per_page") || 30);
  const page = Number(u.searchParams.get("page") || 1);
  const slice = items.slice((page - 1) * perPage, page * perPage);
  // Like GitHub: rel="next" and rel="last" while there are more pages.
  let link;
  if (page * perPage < items.length) {
    const next = new URL(u);
    next.searchParams.set("page", String(page + 1));
    const last = new URL(u);
    last.searchParams.set("page", String(Math.ceil(items.length / perPage)));
    link = `<${next}>; rel="next", <${last}>; rel="last"`;
  }
  return { slice, link };
}

global.fetch = async (url) => {
  const u = new URL(String(url));
  const route = u.pathname.replace("/repos/o/r", "");
  calls.push({ route, page: u.searchParams.get("page"), sha: u.searchParams.get("sha"), since: u.searchParams.get("since") });
  const failure = failRequest && failRequest(route, calls.length, u);
  if (failure) return respond(failure, { message: "simulated" }, { rateLimited: failure === 403 });

  if (route === "/issues") {
    // sort=created&direction=desc, like GitHub (ties by id)
    const sorted = [...gh.issues].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
    const { slice, link } = paginate(sorted, u);
    return respond(200, slice, { link });
  }
  const oneIssue = route.match(/^\/issues\/(\d+)$/);
  if (oneIssue) {
    const issue = gh.issues.find((i) => i.number === Number(oneIssue[1]));
    return issue ? respond(200, issue) : respond(404, { message: "Not Found" });
  }
  if (route === "/commits") {
    if (!gh.head) return respond(409, { message: "Git Repository is empty." });
    const from = u.searchParams.get("sha") || gh.head;
    const since = u.searchParams.get("since");
    const list = [...ancestors(from)].map((s) => gh.commits.get(s))
      .filter((c) => !since || c.commit.author.date >= since)
      .sort((a, b) => b.seq - a.seq)
      .map(publicCommit);
    const { slice, link } = paginate(list, u);
    return respond(200, slice, { link });
  }
  const compare = route.match(/^\/compare\/(.+)\.\.\.(.+)$/);
  if (compare) {
    const [, base, head] = compare;
    if (!gh.commits.has(base) || !gh.commits.has(head)) return respond(404, { message: "Not Found" });
    const fromHead = ancestors(head);
    const fromBase = ancestors(base);
    const status = base === head ? "identical" : fromHead.has(base) ? "ahead" : fromBase.has(head) ? "behind" : "diverged";
    const list = [...fromHead].filter((s) => !fromBase.has(s)).map((s) => gh.commits.get(s)).sort((a, b) => a.seq - b.seq).map(publicCommit);
    const perPage = Number(u.searchParams.get("per_page") || 250);
    const page = Number(u.searchParams.get("page") || 1);
    return respond(200, { status, total_commits: list.length, commits: list.slice((page - 1) * perPage, page * perPage) });
  }
  throw new Error(`Unexpected fetch ${u}`);
};

const { pollGitHubTrigger } = require("../src/pollingCron");
const { MAX_PAGES, PER_PAGE } = require("../src/integrations/github/repoApi");

const trigger = (event) => ({ id: "t1", zapId: "z1", lastPollHash: marker, connection: { accessToken: "gh-token" }, config: { provider: "github", event, repo: "o/r" } });
const pollIssues = () => pollGitHubTrigger(trigger("new_issue"));
const pollPushes = () => pollGitHubTrigger(trigger("new_push"));
const issueTitles = () => runs.map((r) => r.triggerPayload.issue.title);
const commitShas = () => runs.map((r) => r.triggerPayload.commit.sha);
const markerSha = () => marker.split(":")[0];

let realWarn, warnings;
beforeEach(() => {
  resetRepo();
  jobs = new Map();
  failOnQueue = null;
  marker = null;
  markerWrites = [];
  runs = [];
  calls = [];
  failRequest = null;
  warnings = [];
  realWarn ??= console.warn;
  console.warn = (msg) => warnings.push(String(msg));
});
process.on("exit", () => { if (realWarn) console.warn = realWarn; });

// ── new_issue ──
test("issues: empty repository baseline - the first issue ever opened runs", async () => {
  await pollIssues();
  assert.equal(marker, "n:0");
  openIssue({ title: "first!" });
  await pollIssues();
  assert.deepEqual(issueTitles(), ["first!"]);
});

test("issues: first check on a repository with issues and PRs - nothing old runs", async () => {
  openIssue();
  openIssue({ pr: true });
  await pollIssues();
  assert.equal(marker, "n:2");
  assert.equal(runs.length, 0);
});

test("issues: large backlog across multiple pages - every issue runs once, oldest first", async () => {
  openIssue();
  await pollIssues();
  for (let i = 0; i < 250; i++) openIssue({ title: `bulk ${i + 1}` });
  calls = [];
  await pollIssues();

  assert.deepEqual(calls.filter((c) => c.route === "/issues").map((c) => c.page), [null, "2", "3"], "followed the Link header to the end");
  assert.equal(runs.length, 250);
  assert.equal(issueTitles()[0], "bulk 1");
  assert.equal(issueTitles().at(-1), "bulk 250");
  assert.equal(marker, `n:${gh.issues.at(-1).number}`);
});

test("issues: pull requests never run; the checkpoint skips past trailing ones", async () => {
  await pollIssues();
  openIssue({ title: "bug" });
  openIssue({ pr: true });
  openIssue({ title: "feature" });
  openIssue({ pr: true });
  await pollIssues();
  assert.deepEqual(issueTitles(), ["bug", "feature"]);
  assert.equal(marker, `n:${gh.issues.at(-1).number}`);
});

test("issues: the checkpoint issue was deleted - no flood of old issues, only new ones run", async () => {
  for (let i = 0; i < 120; i++) openIssue();
  await pollIssues();
  gh.issues = gh.issues.filter((i) => String(i.id) !== marker); // deleted (or transferred away)
  openIssue({ title: "new one" });
  await pollIssues();
  assert.deepEqual(issueTitles(), ["new one"]);
});

test("issues: duplicates - overlapping pages and a lost checkpoint write give one run per issue", async () => {
  await pollIssues();
  for (let i = 0; i < 150; i++) openIssue();
  const realFetch = global.fetch;
  let opened = false;
  global.fetch = async (url) => {
    // An issue is opened between page 1 and page 2: page 2 shifts and repeats an item.
    if (String(url).includes("page=2") && !opened) { opened = true; openIssue({ title: "opened while paging" }); }
    return realFetch(url);
  };
  try {
    await pollIssues();
  } finally {
    global.fetch = realFetch;
  }
  assert.ok(calls.some((c) => c.page === "2"));
  assert.equal(new Set(runs.map((r) => r.idempotencyKey)).size, runs.length, "the repeated item on page 2 ran once");
  // The issue opened mid-paging landed on page 1 (already read); the check above the
  // highest number seen finds it in the same poll.
  assert.equal(issueTitles().at(-1), "opened while paging");
  assert.equal(runs.length, 151);

  await pollIssues();
  assert.equal(runs.length, 151, "nothing new on the next poll");

  marker = "n:0"; // write lost: re-poll everything
  await pollIssues();
  assert.equal(runs.length, 151);
  assert.equal(jobs.size, 151);
});

test("issues: queue failure mid-batch - checkpoint stays on the last queued issue; next poll queues the rest once", async () => {
  await pollIssues();
  for (let i = 0; i < 5; i++) openIssue();
  failOnQueue = (data) => data.zapRunId === "run_3";
  await assert.rejects(pollIssues(), /simulated Redis failure/);
  assert.equal(marker, `n:${gh.issues[1].number}`);
  assert.equal(jobs.size, 2);

  failOnQueue = null;
  await pollIssues();
  assert.equal(runs.length, 5);
  assert.equal(jobs.size, 5);
  assert.equal(marker, `n:${gh.issues.at(-1).number}`);
});

test("issues: API failure or rate limit on a later page - nothing runs, checkpoint unchanged; next poll catches up", async () => {
  await pollIssues();
  const before = marker;
  for (let i = 0; i < 250; i++) openIssue();
  failRequest = (route, n, u) => (u.searchParams.get("page") === "2" ? 403 : null);
  await pollIssues();
  assert.equal(runs.length, 0);
  assert.equal(marker, before);
  assert.ok(warnings.some((w) => w.includes("rate limit")));

  failRequest = null;
  await pollIssues();
  assert.equal(runs.length, 250);
});

// ── new_issue: backlogs longer than one poll's page limit ──
const issueListRequests = () => calls.filter((c) => c.route === "/issues").length;

test("backlog: more than 30 pages of new issues is processed across polls, oldest first, never skipped", async () => {
  await pollIssues(); // empty repo: n:0
  const total = MAX_PAGES * PER_PAGE + 150; // 31.5 pages
  for (let i = 0; i < total; i++) openIssue();

  await pollIssues();
  assert.ok(runs.length > 0 && runs.length <= MAX_PAGES * PER_PAGE, `first poll: ${runs.length} runs`);
  assert.deepEqual(issueNumbers(), Array.from({ length: runs.length }, (_, i) => i + 1), "oldest first, no holes");
  assert.equal(marker, `n:${runs.length}`);
  assert.ok(warnings.every((w) => !w.includes("pages of new issues")), "no 'stuck' warning");

  await pollIssues();
  assert.equal(runs.length, total);
  assert.deepEqual(issueNumbers(), Array.from({ length: total }, (_, i) => i + 1));
  assert.equal(marker, `n:${total}`);
});

test("backlog: a resumed poll locates its place without re-reading the same 30 pages", async () => {
  await pollIssues();
  const total = MAX_PAGES * PER_PAGE * 2; // 60 pages
  for (let i = 0; i < total; i++) openIssue();
  const pagesPerPoll = [];
  for (let poll = 0; poll < 4 && marker !== `n:${total}`; poll++) {
    calls = [];
    await pollIssues();
    pagesPerPoll.push(issueListRequests());
  }
  // Each poll: ~log2(60) pages to find its place + at most 30 pages it processes - not a
  // re-read of the pages earlier polls already handled.
  assert.ok(pagesPerPoll.every((n) => n <= MAX_PAGES + 8), `pages per poll: ${pagesPerPoll}`);
  assert.ok(pagesPerPoll.length <= 3, `finished in ${pagesPerPoll.length} polls`);
  assert.equal(runs.length, total);
  assert.equal(new Set(runs.map((r) => r.idempotencyKey)).size, runs.length);
});

test("backlog: queue failure mid-backlog - checkpoint on the last queued issue; later polls finish, each once", async () => {
  await pollIssues();
  const total = MAX_PAGES * PER_PAGE + 150;
  for (let i = 0; i < total; i++) openIssue();
  failOnQueue = (data) => data.zapRunId === "run_500";

  await assert.rejects(pollIssues(), /simulated Redis failure/);
  assert.equal(marker, "n:499");

  failOnQueue = null;
  for (let poll = 0; poll < 3 && marker !== `n:${total}`; poll++) await pollIssues();
  assert.equal(marker, `n:${total}`);
  assert.equal(runs.length, total);
  assert.equal(jobs.size, total);
});

test("backlog: a resumed poll still finds new issues opened meanwhile and backdated ones in the processed range", async () => {
  await pollIssues();
  for (let i = 0; i < MAX_PAGES * PER_PAGE + 150; i++) openIssue();
  await pollIssues(); // part one
  openIssue({ title: "opened meanwhile" });
  openIssue({ title: "imported meanwhile", createdAt: OLD_DATE });
  for (let poll = 0; poll < 3; poll++) await pollIssues();
  assert.deepEqual(issueTitles().slice(-2), ["opened meanwhile", "imported meanwhile"]);
  assert.equal(runs.length, MAX_PAGES * PER_PAGE + 152);
});

// ── new_issue: issues whose creation date doesn't match their order of arrival ──
const OLD_DATE = "2020-01-01T00:00:00Z";

test("issues: first check with a historical backdated issue on a later page - it never runs, even after a backlog", async () => {
  for (let i = 0; i < 150; i++) openIssue();
  openIssue({ title: "historical import", createdAt: OLD_DATE }); // already in the repo, sorts last (page 2)
  await pollIssues();
  assert.equal(runs.length, 0);

  for (let i = 0; i < 250; i++) openIssue({ title: `new ${i + 1}` });
  await pollIssues();
  assert.equal(runs.length, 250);
  assert.ok(!issueTitles().includes("historical import"), "a historical issue must not run as new");
});

test("issues: a new issue imported with an old creation date (sorted onto a later page) runs", async () => {
  for (let i = 0; i < 150; i++) openIssue();
  await pollIssues();
  openIssue({ title: "imported", createdAt: OLD_DATE });
  openIssue({ title: "normal" });
  await pollIssues();
  assert.deepEqual(issueTitles(), ["imported", "normal"]);
});

test("issues: an issue transferred in from another repo (keeps its old id and date) runs", async () => {
  for (let i = 0; i < 150; i++) openIssue();
  await pollIssues();
  openIssue({ title: "transferred in", id: 42, createdAt: "2021-06-01T00:00:00Z" });
  await pollIssues();
  assert.deepEqual(issueTitles(), ["transferred in"]);
});

test("issues: the newest issue is backdated and nothing newer exists - still found", async () => {
  for (let i = 0; i < 150; i++) openIssue();
  await pollIssues();
  openIssue({ title: "imported, nothing after it", createdAt: OLD_DATE });
  await pollIssues();
  assert.deepEqual(issueTitles(), ["imported, nothing after it"]);
});

test("issues: deleted issue numbers in the range are skipped", async () => {
  await pollIssues();
  openIssue({ title: "a" });
  const gone = openIssue({ title: "deleted" });
  openIssue({ title: "c" });
  gh.issues = gh.issues.filter((i) => i !== gone);
  await pollIssues();
  assert.deepEqual(issueTitles(), ["a", "c"]);
  await pollIssues();
  assert.equal(runs.length, 2, "nothing re-run on the next poll");
});

test("issues: an old id-based checkpoint (previous poller) keeps working", async () => {
  for (let i = 0; i < 5; i++) openIssue();
  marker = String(gh.issues.at(-1).id);
  openIssue({ title: "after upgrade 1" });
  openIssue({ title: "after upgrade 2" });
  await pollIssues();
  assert.deepEqual(issueTitles(), ["after upgrade 1", "after upgrade 2"]);

  openIssue({ title: "later" });
  await pollIssues();
  assert.deepEqual(issueTitles(), ["after upgrade 1", "after upgrade 2", "later"]);
});

// ── new_issue: number gaps (deleted issues, backdated issues), bounded per poll ──
const singleIssueLookups = () => calls.filter((c) => /^\/issues\/\d+$/.test(c.route)).length;
const issueNumbers = () => runs.map((r) => r.triggerPayload.issue.number);
const deleteIssues = (from, to) => { gh.issues = gh.issues.filter((i) => i.number < from || i.number > to); };

test("gaps: more than 100 unlisted issues are processed over several polls, in order, never more than 100 lookups per poll", async () => {
  for (let i = 0; i < 150; i++) openIssue();
  await pollIssues(); // n:150
  for (let i = 0; i < 250; i++) openIssue({ title: `imported ${i + 1}`, createdAt: OLD_DATE }); // #151-#400, sorted last
  openIssue({ title: "normal" }); // #401, listed first

  const perPoll = [];
  for (let poll = 0; poll < 3; poll++) {
    calls = [];
    await pollIssues();
    perPoll.push(singleIssueLookups());
  }
  assert.ok(perPoll.every((n) => n <= 100), `lookups per poll: ${perPoll}`);
  assert.equal(marker, "n:401");
  assert.equal(runs.length, 251);
  assert.deepEqual(issueNumbers(), Array.from({ length: 251 }, (_, i) => 151 + i), "oldest first, each once");
});

test("gaps: progress across polls survives a queue failure, each issue queued exactly once", async () => {
  for (let i = 0; i < 150; i++) openIssue();
  await pollIssues();
  for (let i = 0; i < 250; i++) openIssue({ createdAt: OLD_DATE });
  openIssue();

  await pollIssues(); // #151-#250
  failOnQueue = (data) => data.zapRunId === "run_120";
  await assert.rejects(pollIssues(), /simulated Redis failure/);
  assert.equal(marker, "n:269", "checkpoint on the last queued issue");

  failOnQueue = null;
  for (let poll = 0; poll < 3; poll++) await pollIssues();
  assert.equal(runs.length, 251);
  assert.equal(jobs.size, 251);
  assert.equal(marker, "n:401");
});

test("gaps: more than 100 deleted numbers don't block a later issue", async () => {
  for (let i = 0; i < 150; i++) openIssue();
  await pollIssues();
  for (let i = 0; i < 150; i++) openIssue();
  deleteIssues(151, 300); // spam wave, deleted
  openIssue({ title: "real one" }); // #301

  await pollIssues();
  assert.equal(runs.length, 0);
  assert.equal(marker, "n:250", "100 deleted numbers resolved this poll");
  await pollIssues();
  assert.deepEqual(issueTitles(), ["real one"]);
  assert.equal(marker, "n:301");
});

test("gaps: a deleted newest issue with nothing after it - nothing runs and the checkpoint doesn't skip ahead", async () => {
  for (let i = 0; i < 150; i++) openIssue();
  await pollIssues();
  openIssue();
  deleteIssues(151, 151);
  calls = [];
  await pollIssues();
  assert.equal(runs.length, 0);
  assert.equal(marker, "n:150", "#151 might not exist yet - it isn't marked as handled");
  assert.ok(singleIssueLookups() <= 3, "a quiet poll costs only a few lookups");

  openIssue({ title: "imported after a deleted one", createdAt: OLD_DATE }); // #152, backdated: not listed near the top
  await pollIssues();
  assert.deepEqual(issueTitles(), ["imported after a deleted one"]);
  assert.equal(marker, "n:152");
});

test("gaps: a backdated issue after several deleted ones is found as soon as any later issue appears", async () => {
  for (let i = 0; i < 150; i++) openIssue();
  await pollIssues();
  for (let i = 0; i < 4; i++) openIssue();
  deleteIssues(151, 154);
  openIssue({ title: "imported", createdAt: OLD_DATE }); // #155: beyond the look-ahead
  await pollIssues();
  assert.equal(runs.length, 0);
  assert.equal(marker, "n:150");

  openIssue({ title: "normal" }); // #156, listed: everything below it is resolved
  await pollIssues();
  assert.deepEqual(issueTitles(), ["imported", "normal"]);
});

// ── new_issue: switching an old id checkpoint (previous poller) to numbers ──
/** What the previous poller left behind: a run for an issue (keyed by id) and an id checkpoint. */
function previousPollerRan(issue) {
  runs.push({ id: `old_${issue.id}`, idempotencyKey: `t1-issue-${issue.id}`, status: "SUCCESS", triggerPayload: { issue: { id: issue.id, number: issue.number, title: issue.title } } });
  marker = String(issue.id);
}

test("migration: transferred-in and imported issues that arrived since the old checkpoint run (no early stop)", async () => {
  for (let i = 0; i < 150; i++) openIssue();
  previousPollerRan(gh.issues.at(-1)); // old checkpoint: id of #150
  openIssue({ title: "transferred in", id: 42, createdAt: "2021-06-01T00:00:00Z" }); // #151, old id and date
  openIssue({ title: "imported", createdAt: OLD_DATE }); // #152, new id, old date (sorted last)
  openIssue({ title: "normal" }); // #153

  await pollIssues();
  assert.deepEqual(issueTitles().slice(1), ["transferred in", "imported", "normal"]);
  assert.equal(marker, "n:153");
});

test("migration: the old checkpoint issue never ran (it was the baseline) and sorts on a later page - still located", async () => {
  for (let i = 0; i < 150; i++) openIssue();
  const baseline = openIssue({ title: "baseline", createdAt: OLD_DATE }); // #151, sorted last
  marker = String(baseline.id);
  openIssue({ title: "transferred in", id: 7, createdAt: "2021-06-01T00:00:00Z" }); // #152
  openIssue({ title: "normal" }); // #153

  await pollIssues();
  assert.deepEqual(issueTitles(), ["transferred in", "normal"], "nothing at or below #151 ran");
});

test("migration: old checkpoint issue deleted, no run - no guess: provably new issues run, the rest waits for a person", async () => {
  for (let i = 0; i < 150; i++) openIssue();
  const checkpointIssue = gh.issues.at(-1); // #150, never ran (baseline)
  marker = String(checkpointIssue.id);
  deleteIssues(150, 150);
  openIssue({ title: "transferred in", id: 9, createdAt: "2021-06-01T00:00:00Z" }); // #151: old id - can't prove it's new
  openIssue({ title: "normal" }); // #152: higher id than the old checkpoint - provably new
  openIssue({ title: "imported", createdAt: OLD_DATE }); // #153: higher id, backdated

  await pollIssues();
  assert.deepEqual(issueTitles(), ["normal", "imported"], "only issues provably after the old checkpoint ran");
  assert.equal(marker, `pending:${checkpointIssue.id}:n:153`, "no number guessed for the old checkpoint");
  const warning = warnings.find((w) => w.includes("needs attention"));
  assert.ok(warning, "a clear warning");
  assert.match(warning, /#152/);
  assert.match(warning, /UPDATE "Trigger" SET "lastPollHash" = 'n:<number>' WHERE id = 't1'/);

  openIssue({ title: "later" });
  warnings = [];
  await pollIssues();
  assert.equal(issueTitles().at(-1), "later", "new issues keep running while waiting");
  assert.ok(warnings.some((w) => w.includes("needs attention")), "and the warning repeats");

  // A person checks the repository: the deleted issue was #150. Everything after it runs once.
  marker = "n:150";
  await pollIssues();
  assert.deepEqual(issueTitles(), ["normal", "imported", "later", "transferred in"]);
  assert.equal(jobs.size, 4);
  assert.equal(marker, "n:154");
});

test("migration: old checkpoint deleted and nothing provably new yet - nothing runs, nothing marked handled, until a newer issue appears", async () => {
  for (let i = 0; i < 150; i++) openIssue();
  const checkpointIssue = gh.issues.at(-1);
  marker = String(checkpointIssue.id);
  deleteIssues(150, 150);
  openIssue({ title: "transferred in", id: 9, createdAt: "2021-06-01T00:00:00Z" }); // #151

  await pollIssues();
  assert.equal(runs.length, 0);
  assert.equal(marker, `pending:${checkpointIssue.id}`);
  assert.ok(warnings.some((w) => w.includes("needs attention")));

  calls = [];
  await pollIssues(); // waiting: a cheap check, not a full scan
  assert.equal(issueListRequests(), 1);

  openIssue({ title: "normal" }); // #152
  await pollIssues();
  assert.deepEqual(issueTitles(), ["normal"]);
  assert.equal(marker, `pending:${checkpointIssue.id}:n:152`);
});

test("migration: queue failure during the switch - checkpoint already numeric and safe; next poll finishes once", async () => {
  for (let i = 0; i < 150; i++) openIssue();
  previousPollerRan(gh.issues.at(-1));
  openIssue({ title: "transferred in", id: 42, createdAt: "2021-06-01T00:00:00Z" });
  openIssue({ title: "a" });
  openIssue({ title: "b" });
  failOnQueue = (data) => data.zapRunId === "run_3";

  await assert.rejects(pollIssues(), /simulated Redis failure/);
  assert.equal(marker, "n:151", "switched to numbers, and on the last queued issue");

  failOnQueue = null;
  await pollIssues();
  assert.deepEqual(issueTitles().slice(1), ["transferred in", "a", "b"]);
  assert.equal(jobs.size, 3);
  assert.equal(marker, "n:153");
});

// ── new_push ──
test("pushes: empty repository - the first push's commits all run", async () => {
  await pollPushes();
  assert.equal(marker, "empty");
  await pollPushes();
  assert.equal(marker, "empty", "still empty: nothing to do");

  const pushed = push(3);
  await pollPushes();
  assert.deepEqual(commitShas(), pushed);
  assert.equal(markerSha(), gh.head);
});

test("pushes: more than 10 commits in one push, across compare pages - all run, oldest first", async () => {
  push(1);
  await pollPushes();
  const pushed = push(250);
  calls = [];
  await pollPushes();
  assert.deepEqual(calls.filter((c) => c.route.startsWith("/compare")).map((c) => c.page), ["1", "2", "3"]);
  assert.deepEqual(commitShas(), pushed);
  assert.equal(markerSha(), gh.head);
});

test("pushes: a merge brings the feature branch's commits and the merge commit", async () => {
  const [base] = push(1);
  await pollPushes();
  const f1 = makeCommit("feature 1", { parents: [base] });
  const f2 = makeCommit("feature 2", { parents: [f1] });
  const main1 = push(1)[0];
  const merge = makeCommit("Merge feature", { parents: [main1, f2] });
  gh.head = merge;
  await pollPushes();
  assert.deepEqual(commitShas(), [f1, f2, main1, merge]);
});

test("pushes: force push that rewrites history - only the new history's commits run", async () => {
  const [a, b] = push(2);
  const c = push(1)[0];
  await pollPushes(); // checkpoint at C
  // git reset --hard B~ ; commit B' ; commit D ; git push --force  (B and C are gone from the branch)
  gh.head = a;
  const [bPrime, d] = push(2);
  await pollPushes();
  assert.deepEqual(commitShas(), [bPrime, d], "rewritten commits are new commits; dropped ones don't run");
  assert.equal(markerSha(), d);
  assert.ok(gh.commits.has(c) && gh.commits.has(b), "GitHub still has the old commits; compare reports 'diverged'");
});

test("pushes: force push back to an older commit - no runs; later commits on top run", async () => {
  const [a] = push(1);
  push(2);
  await pollPushes();
  gh.head = a; // git push --force origin A:main
  await pollPushes();
  assert.equal(runs.length, 0);
  assert.equal(markerSha(), a);

  const [e] = push(1);
  await pollPushes();
  assert.deepEqual(commitShas(), [e]);
});

test("pushes: checkpoint commit deleted from GitHub - finds new commits by date; nothing old runs, nothing duplicated", async () => {
  const [a] = push(1, { ageSec: 3 * 86400 });
  const [c] = push(1, { ageSec: 3 * 86400 });
  await pollPushes(); // checkpoint at C
  const [x] = push(1);
  await pollPushes(); // X ran
  // History rewritten on top of A, and the old commits purged from GitHub.
  gh.head = a;
  const rewritten = push(2);
  gh.commits.delete(c);
  gh.commits.delete(x);

  await pollPushes();
  assert.deepEqual(commitShas(), [x, ...rewritten], "A (old) didn't run; X wasn't run twice");
  assert.ok(warnings.some((w) => w.includes("no longer exists") && w.includes("by date")));
  assert.ok(calls.some((c) => c.route === "/commits" && c.since));
  assert.equal(markerSha(), gh.head);
});

test("pushes: old-format checkpoint (sha only) keeps working and gains a time", async () => {
  const [old] = push(1);
  marker = old; // what the previous poller stored
  const pushed = push(2);
  await pollPushes();
  assert.deepEqual(commitShas(), pushed);
  assert.match(marker, new RegExp(`^${gh.head}:\\d+$`));
});

test("pushes: old-format checkpoint whose commit was deleted - restarts at head and warns", async () => {
  marker = "c9999";
  push(2);
  await pollPushes();
  assert.equal(runs.length, 0);
  assert.equal(markerSha(), gh.head);
  assert.ok(warnings.some((w) => w.includes("no longer exists") && w.includes("Check o/r")));
});

test("pushes: duplicates - a lost checkpoint write re-polls without duplicate runs or jobs", async () => {
  push(1);
  await pollPushes();
  const before = marker;
  push(4);
  await pollPushes();
  marker = before;
  await pollPushes();
  assert.equal(runs.length, 4);
  assert.equal(jobs.size, 4);
});

test("pushes: queue failure mid-batch - checkpoint unchanged; next poll queues the rest once", async () => {
  push(1);
  await pollPushes();
  const before = marker;
  push(5);
  failOnQueue = (data) => data.zapRunId === "run_3";
  await assert.rejects(pollPushes(), /simulated Redis failure/);
  assert.equal(marker, before);
  assert.equal(jobs.size, 2);

  failOnQueue = null;
  await pollPushes();
  assert.equal(runs.length, 5);
  assert.equal(jobs.size, 5);
  assert.equal(markerSha(), gh.head);
});

test("pushes: API failure on compare - nothing runs, checkpoint unchanged; next poll catches up", async () => {
  push(1);
  await pollPushes();
  const before = marker;
  push(3);
  failRequest = (route) => (route.startsWith("/compare") ? 502 : null);
  await pollPushes();
  assert.equal(runs.length, 0);
  assert.equal(marker, before);

  failRequest = null;
  await pollPushes();
  assert.equal(runs.length, 3);
});

test("pushes: first push of a whole imported history into an empty repo - starts at head without thousands of runs", async () => {
  await pollPushes();
  push(MAX_PAGES * PER_PAGE + 1);
  await pollPushes();
  assert.equal(runs.length, 0);
  assert.equal(markerSha(), gh.head);
  assert.ok(warnings.some((w) => w.includes("first push")));
});
