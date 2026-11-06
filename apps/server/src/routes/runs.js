const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");
const requireAuth = require("../middleware/auth");

// Zap History: runs across all of the signed-in user's Zaps.
// Every query is scoped with `zap: { userId }`, so another user's runs never match,
// even when their Zap or run ids are passed in.

const RUN_STATUSES = ["QUEUED", "RUNNING", "SUCCESS", "FAILED", "FILTERED"];
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_IDS = 100;
const MAX_SEARCH = 100;

class BadRequest extends Error {}

// Express may hand us arrays for repeated params (?status=a&status=b); we take one value.
function single(value, name) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new BadRequest(`${name} must be given once`);
  return value.trim() || undefined;
}

// "FAILED" or "RUNNING,QUEUED"; "ALL" (or nothing) means no status filter.
function parseStatuses(raw) {
  const value = single(raw, "status");
  if (!value || value.toUpperCase() === "ALL") return null;
  const statuses = [...new Set(value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const bad = statuses.find((s) => !RUN_STATUSES.includes(s));
  if (bad || statuses.length === 0) {
    throw new BadRequest(`status must be ALL or one or more of ${RUN_STATUSES.join(", ")}`);
  }
  return statuses;
}

function parseDate(raw, name) {
  const value = single(raw, name);
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequest(`${name} must be an ISO date`);
  return date;
}

function parseLimit(raw) {
  const value = single(raw, "limit");
  if (!value) return DEFAULT_LIMIT;
  if (!/^\d+$/.test(value) || Number(value) < 1) throw new BadRequest("limit must be a positive whole number");
  return Math.min(Number(value), MAX_LIMIT);
}

// The cursor is the last run of the previous page: base64url("<createdAt ISO>|<id>").
// Ordering by createdAt and then id keeps pages stable when runs share a timestamp.
function encodeCursor(run) {
  return Buffer.from(`${new Date(run.createdAt).toISOString()}|${run.id}`).toString("base64url");
}

function decodeCursor(raw) {
  const value = single(raw, "cursor");
  if (!value) return null;
  const [iso, id] = Buffer.from(value, "base64url").toString("utf8").split("|");
  const createdAt = new Date(iso);
  if (!id || !iso || Number.isNaN(createdAt.getTime())) throw new BadRequest("cursor is invalid");
  return { createdAt, id };
}

/** Filters shared by the list and the summary. Throws BadRequest on bad input. */
function parseFilters(query, userId) {
  const zapId = single(query.zapId, "zapId");
  const q = single(query.q, "q");
  if (q && q.length > MAX_SEARCH) throw new BadRequest(`q must be at most ${MAX_SEARCH} characters`);
  const from = parseDate(query.from, "from");
  const to = parseDate(query.to, "to");
  if (from && to && from > to) throw new BadRequest("from must be before to");

  return {
    zap: { userId, ...(q && { zapName: { contains: q, mode: "insensitive" } }) },
    ...(zapId && { zapId }),
    ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
  };
}

// Just enough per run for the list; the full trace (trigger data, step input/output)
// comes from GET /zaps/:id/runs/:runId when a run is opened.
const RUN_LIST_SELECT = {
  id: true,
  zapId: true,
  status: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  retryOfRunId: true,
  zap: { select: { id: true, zapName: true } },
  stepExecutions: { select: { id: true, status: true, error: true }, orderBy: { createdAt: "asc" } },
};

const ORDER = [{ createdAt: "desc" }, { id: "desc" }];

function fail(res, err, label) {
  if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
  console.error(`Error ${label}:`, err);
  // Never an empty list: the page would show "No runs yet" instead of its retry banner.
  return res.status(500).json({ error: "Failed to load run history" });
}

// GET /runs/summary?zapId=&from=&to=&q= - run counts per status for the filter chips.
// Ignores status, so every chip can show its count under the other filters.
router.get("/summary", requireAuth, async (req, res) => {
  try {
    const where = parseFilters(req.query, req.userId);
    const groups = await prisma.zapRun.groupBy({ by: ["status"], where, _count: { _all: true } });

    const counts = Object.fromEntries(RUN_STATUSES.map((s) => [s, 0]));
    for (const g of groups) {
      if (g.status in counts) counts[g.status] = g._count._all;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    res.json({ counts: { ALL: total, ...counts } });
  } catch (err) {
    fail(res, err, "fetching run summary");
  }
});

// GET /runs?status=&zapId=&from=&to=&q=&cursor=&limit=
//   -> { runs: [{ ...run, zap: { id, zapName }, stepExecutions: [{ id, status, error }] }], nextCursor }
// GET /runs?ids=a,b,c -> those runs (if they're yours), to refresh runs still in progress.
router.get("/", requireAuth, async (req, res) => {
  try {
    const idsParam = single(req.query.ids, "ids");
    if (idsParam) {
      const ids = [...new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))];
      if (ids.length === 0 || ids.length > MAX_IDS) throw new BadRequest(`ids must list 1 to ${MAX_IDS} run ids`);
      const runs = await prisma.zapRun.findMany({
        where: { id: { in: ids }, zap: { userId: req.userId } },
        orderBy: ORDER,
        select: RUN_LIST_SELECT,
      });
      return res.json({ runs, nextCursor: null });
    }

    const where = parseFilters(req.query, req.userId);
    const statuses = parseStatuses(req.query.status);
    const limit = parseLimit(req.query.limit);
    const cursor = decodeCursor(req.query.cursor);

    if (statuses) where.status = { in: statuses };
    if (cursor) {
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }

    // One extra row tells us whether there is another page.
    const rows = await prisma.zapRun.findMany({ where, orderBy: ORDER, take: limit + 1, select: RUN_LIST_SELECT });
    const runs = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? encodeCursor(runs[runs.length - 1]) : null;

    res.json({ runs, nextCursor });
  } catch (err) {
    fail(res, err, "fetching run history");
  }
});

module.exports = router;
module.exports.encodeCursor = encodeCursor;
