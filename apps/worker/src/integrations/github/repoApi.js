/**
 * Read-only GitHub REST calls for the "New Issue" and "New Code Push" triggers.
 * Every list follows pagination to the end (or fails), so a burst of issues or commits
 * between two checks is never cut off. HTTP failures throw an error with `status`;
 * a backlog longer than MAX_PAGES throws an error with `backlog: true`.
 */
const { fetchWithTimeout } = require("../../fetchWithTimeout");

const API_URL = "https://api.github.com";
const PER_PAGE = 100; // GitHub's maximum page size
const MAX_PAGES = 30;

function createGitHubClient(accessToken) {
  const headers = { "User-Agent": "Flowline-Worker", Accept: "application/vnd.github.v3+json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  /** GET a path or a full URL (a `next` link). -> { data, status, next, lastPage } */
  async function get(pathOrUrl) {
    const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${API_URL}${pathOrUrl}`;
    const res = await fetchWithTimeout(url, { headers });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const rateLimited = res.status === 403 && res.headers?.get?.("x-ratelimit-remaining") === "0";
      const err = new Error(`GitHub ${rateLimited ? "API rate limit reached" : `request failed (${res.status})${body?.message ? `: ${body.message}` : ""}`}`);
      err.status = res.status;
      throw err;
    }
    const link = res.headers?.get?.("link") || "";
    const next = (link.match(/<([^>]+)>;\s*rel="next"/) || [])[1];
    const last = (link.match(/<([^>]+)>;\s*rel="last"/) || [])[1];
    const lastPage = last ? Number(new URL(last).searchParams.get("page")) || null : null;
    return { data: await res.json(), status: res.status, next, lastPage };
  }

  return { get };
}

function backlogError(what) {
  const err = new Error(`More than ${MAX_PAGES} pages of ${what} since the last check; not processed this time so nothing is skipped.`);
  err.backlog = true;
  return err;
}

const issuesPath = (repo) => `/repos/${repo}/issues?state=all&sort=created&direction=desc&per_page=${PER_PAGE}`;

/** The newest page of issues (and pull requests, which GitHub lists as issues). */
async function latestIssues(client, repo) {
  return (await client.get(issuesPath(repo))).data;
}

/**
 * Issues/PRs numbered above `afterNumber` that the creation-date listing shows, read from the
 * OLDEST new ones toward the newest, at most `maxPages` pages per call.
 *  - The pages before the first one that reaches a number at or below the checkpoint hold only
 *    new issues (issues listed by date never move up past newer ones), so that "boundary" page
 *    is found by binary search over page numbers (GitHub's rel="last" gives the page count) -
 *    a few requests instead of reading every page.
 *  - From the boundary, pages are read toward page 1. If the limit stops it first, the result
 *    is `complete: false` with the oldest part of the backlog; the next call (after the caller
 *    has moved its checkpoint) finds the new boundary the same way and carries on.
 * Issues whose creation date is older than their arrival (Issue Import API, transferred in)
 * can sort below the boundary - the caller finds those by number with issueByNumber.
 * -> { items, complete }
 */
async function issuesAbove(client, repo, afterNumber, { maxPages = MAX_PAGES } = {}) {
  const pages = new Map();
  let pageCount = 1;
  const readPage = async (page) => {
    if (!pages.has(page)) {
      const { data, lastPage } = await client.get(page === 1 ? issuesPath(repo) : `${issuesPath(repo)}&page=${page}`);
      pages.set(page, Array.isArray(data) ? data : []);
      if (page === 1 && lastPage) pageCount = lastPage;
    }
    return pages.get(page);
  };
  const reachesCheckpoint = (items) => items.some((item) => Number(item.number) <= afterNumber);

  let boundary = 1;
  if (!reachesCheckpoint(await readPage(1)) && pageCount > 1) {
    // First page (newest first) that reaches the checkpoint; the last page if none does.
    let low = 2;
    let high = pageCount;
    boundary = pageCount;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (reachesCheckpoint(await readPage(mid))) {
        boundary = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
  }

  const items = [];
  const lowestPage = Math.max(1, boundary - maxPages + 1);
  for (let page = boundary; page >= lowestPage; page--) {
    items.push(...(await readPage(page)).filter((item) => Number(item.number) > afterNumber));
  }
  return { items, complete: lowestPage === 1 };
}

/**
 * One issue or PR by number, or null if there is none in this repo: never existed yet,
 * deleted (404/410), or transferred away (GitHub redirects to the other repo).
 */
async function issueByNumber(client, repo, number) {
  try {
    const { data } = await client.get(`/repos/${repo}/issues/${number}`);
    const inThisRepo = !data?.repository_url || data.repository_url.toLowerCase().endsWith(`/repos/${repo}`.toLowerCase());
    return inThisRepo && Number(data.number) === number ? data : null;
  } catch (err) {
    if (err.status === 404 || err.status === 410) return null;
    throw err;
  }
}

/**
 * Calls onPage(items) for each page of the issue list (no early stop based on dates or ids)
 * until it returns true, the list ends, or MAX_PAGES pages were read.
 * -> { complete }: false only if the page limit cut the scan short.
 */
async function scanIssuePages(client, repo, onPage) {
  let url = issuesPath(repo);
  for (let page = 1; url; page++) {
    const { data, next } = await client.get(url);
    if (onPage(Array.isArray(data) ? data : [])) return { complete: true };
    if (!next) return { complete: true };
    if (page >= MAX_PAGES) return { complete: false };
    url = next;
  }
  return { complete: true };
}

/** The commit at the head of the default branch, or null for an empty repository. */
async function branchHead(client, repo) {
  try {
    const { data } = await client.get(`/repos/${repo}/commits?per_page=1`);
    return Array.isArray(data) && data[0] ? data[0] : null;
  } catch (err) {
    if (err.status === 409) return null; // "Git Repository is empty."
    throw err;
  }
}

/**
 * Commits reachable from `head` but not from `base`, oldest first (GitHub's compare order).
 * Works after a force push: for diverged histories it returns the commits on the new history
 * since the common ancestor; when the branch moved back ("behind") there are none.
 * Throws status 404 if `base` no longer exists on GitHub.
 */
async function commitsBetween(client, repo, base, head) {
  const commits = [];
  for (let page = 1; ; page++) {
    const { data } = await client.get(`/repos/${repo}/compare/${base}...${head}?per_page=${PER_PAGE}&page=${page}`);
    const pageCommits = Array.isArray(data.commits) ? data.commits : [];
    commits.push(...pageCommits);
    const total = Number(data.total_commits ?? commits.length);
    if (commits.length >= total || pageCommits.length === 0) return { status: data.status, commits };
    if (page >= MAX_PAGES) throw backlogError("new commits");
  }
}

/** Commits on the branch ending at `head` (optionally only since an ISO time), newest first. */
async function commitsOnBranch(client, repo, head, { since } = {}) {
  const commits = [];
  let url = `/repos/${repo}/commits?sha=${encodeURIComponent(head)}&per_page=${PER_PAGE}${since ? `&since=${encodeURIComponent(since)}` : ""}`;
  for (let page = 1; url; page++) {
    const { data, next } = await client.get(url);
    commits.push(...(Array.isArray(data) ? data : []));
    if (!next) return commits;
    if (page >= MAX_PAGES) throw backlogError("commits");
    url = next;
  }
  return commits;
}

module.exports = { createGitHubClient, latestIssues, issuesAbove, issueByNumber, scanIssuePages, branchHead, commitsBetween, commitsOnBranch, PER_PAGE, MAX_PAGES };
