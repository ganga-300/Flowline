// ZapRun.recoveryAttempts against a REAL Postgres: the migration (on a database that already
// has runs), the compare-and-set claim under real concurrency, the guarded FAILED transition
// and alert, and the column default for new (e.g. manually retried) runs. Uses the real
// Prisma client; BullMQ is an in-memory fake here (real BullMQ: redisRecovery.integration).
//
// Opt-in - skipped unless POSTGRES_INTEGRATION_URL is set. It DROPS AND RECREATES the public
// schema of that database, so point it at a throwaway Postgres, e.g.
//   POSTGRES_INTEGRATION_URL=postgresql://postgres:postgres@localhost:5440/flowline_it npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const URL = process.env.POSTGRES_INTEGRATION_URL;
const skip = !URL && "set POSTGRES_INTEGRATION_URL to run against a real Postgres";

const { Client } = require("pg");
const { claimRecoveryAttempt, recoverRuns, MAX_RECOVERY_ATTEMPTS } = require("../src/runRecovery");

const MIGRATIONS_DIR = path.join(__dirname, "../../server/prisma/migrations");
const NEW_MIGRATION = "20261103120000_run_recovery_attempts";
const silent = { log() {}, warn() {}, error() {} };
const MIN = 60_000;

let sql, prisma;
const migrationNames = () => fs.readdirSync(MIGRATIONS_DIR).filter((n) => fs.existsSync(path.join(MIGRATIONS_DIR, n, "migration.sql"))).sort();
const applyMigration = (name) => sql.query(fs.readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"));

function fakeQueue() {
  const jobs = new Map();
  return {
    jobs,
    async add(name, data, opts) { if (!jobs.has(opts.jobId)) jobs.set(opts.jobId, { name, data, opts, state: "waiting" }); },
    async getJob(id) {
      const job = jobs.get(id);
      return job && { data: job.data, getState: async () => job.state, remove: async () => { jobs.delete(id); } };
    },
  };
}

async function insertRun(id, status, { attempts, startedMinutesAgo = 60 } = {}) {
  await sql.query(
    `INSERT INTO "ZapRun" ("id", "zapId", "status", "idempotencyKey", "triggerPayload", "startedAt", "createdAt"${attempts === undefined ? "" : ', "recoveryAttempts"'})
     VALUES ($1, 'z1', $2, $1, '{}', now() - make_interval(mins => $3), now() - make_interval(mins => $3)${attempts === undefined ? "" : ", $4"})`,
    attempts === undefined ? [id, status, startedMinutesAgo] : [id, status, startedMinutesAgo, attempts]
  );
}
const attemptsOf = async (id) => (await sql.query(`SELECT "recoveryAttempts" AS n, "status", "completedAt" FROM "ZapRun" WHERE "id" = $1`, [id])).rows[0];

before(async () => {
  if (skip) return;
  sql = new Client({ connectionString: URL });
  await sql.connect();
  await sql.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
});
after(async () => {
  if (prisma) await prisma.$disconnect();
  if (sql) await sql.end();
});

test("migration: adds recoveryAttempts INTEGER NOT NULL DEFAULT 0, existing runs get 0", { skip }, async () => {
  const all = migrationNames();
  assert.equal(all.at(-1), NEW_MIGRATION, "the new migration is the latest");
  for (const name of all.slice(0, -1)) await applyMigration(name);

  // A database that already has runs (as in production).
  await sql.query(`INSERT INTO "User" ("id", "email", "password") VALUES ('u1', 'u1@example.com', 'x')`);
  await sql.query(`INSERT INTO "Zap" ("id", "zapName", "updatedAt", "userId") VALUES ('z1', 'Follow up', now(), 'u1')`);
  await insertRun("existing-running", "RUNNING");
  await insertRun("existing-success", "SUCCESS");

  await applyMigration(NEW_MIGRATION);

  const column = (await sql.query(
    `SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'ZapRun' AND column_name = 'recoveryAttempts'`
  )).rows[0];
  assert.deepEqual(column, { data_type: "integer", is_nullable: "NO", column_default: "0" });
  assert.equal((await attemptsOf("existing-running")).n, 0);
  assert.equal((await attemptsOf("existing-success")).n, 0);

  // The real Prisma client (generated from the updated schema) for the tests below.
  const { PrismaClient } = require("../../server/node_modules/@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL }) });
});

test("default: a new run - e.g. a manual Retry run - starts at 0", { skip }, async () => {
  const run = await prisma.zapRun.create({ data: { zapId: "z1", status: "QUEUED", idempotencyKey: "z1-retry-1", triggerPayload: {}, retryOfRunId: "existing-running" } });
  assert.equal(run.recoveryAttempts, 0);
});

test("compare-and-set: 10 concurrent claims from the same snapshot - exactly one wins", { skip }, async () => {
  await insertRun("cas", "RUNNING");
  const snapshot = { id: "cas", recoveryAttempts: 0 };
  const claims = await Promise.all(Array.from({ length: 10 }, () => claimRecoveryAttempt(prisma, snapshot)));
  assert.equal(claims.filter((c) => c === "claimed").length, 1);
  assert.equal(claims.filter((c) => c === "lost").length, 9);
  assert.equal((await attemptsOf("cas")).n, 1);
});

test(`limit: claims count up to ${MAX_RECOVERY_ATTEMPTS}, then "exhausted" without another increment`, { skip }, async () => {
  await insertRun("limit", "RUNNING");
  const outcomes = [];
  for (let i = 0; i < 5; i++) {
    const { n } = await attemptsOf("limit");
    outcomes.push(await claimRecoveryAttempt(prisma, { id: "limit", recoveryAttempts: n }));
  }
  assert.deepEqual(outcomes, ["claimed", "claimed", "claimed", "exhausted", "exhausted"]);
  assert.equal((await attemptsOf("limit")).n, MAX_RECOVERY_ATTEMPTS);
});

test("finished and deleted runs: claims match nothing; counts and statuses unchanged", { skip }, async () => {
  for (const status of ["SUCCESS", "FAILED", "FILTERED"]) {
    await insertRun(`fin-${status}`, status);
    assert.equal(await claimRecoveryAttempt(prisma, { id: `fin-${status}`, recoveryAttempts: 0 }), "lost");
    assert.deepEqual({ ...(await attemptsOf(`fin-${status}`)), completedAt: undefined }, { n: 0, status, completedAt: undefined });
  }
  assert.equal(await claimRecoveryAttempt(prisma, { id: "never-existed", recoveryAttempts: 0 }), "lost");
});

test("concurrent sweeps (no lock) against real Postgres: one attempt counted, one job added", { skip }, async () => {
  await sql.query(`UPDATE "ZapRun" SET "status" = 'SUCCESS' WHERE "status" IN ('QUEUED', 'RUNNING')`); // only this test's run is unfinished
  await insertRun("swept", "RUNNING", { startedMinutesAgo: 30 });
  const queue = fakeQueue();
  const results = await Promise.all(Array.from({ length: 5 }, () => recoverRuns(prisma, queue, { log: silent })));
  assert.equal(results.filter((r) => r.swept === "added").length, 1);
  assert.equal((await attemptsOf("swept")).n, 1);
  assert.deepEqual([...queue.jobs.keys()], ["zap-run-swept"]);
  assert.deepEqual(queue.jobs.get("zap-run-swept").data, { zapRunId: "swept" }, "no attempt count in job data");
});

test("giving up: the run is FAILED with completedAt and an alert row - and a run that finished is never overwritten", { skip }, async () => {
  await sql.query(`UPDATE "ZapRun" SET "status" = 'SUCCESS' WHERE "status" IN ('QUEUED', 'RUNNING')`);
  await insertRun("spent", "RUNNING", { attempts: MAX_RECOVERY_ATTEMPTS, startedMinutesAgo: 30 });
  const queue = fakeQueue();

  assert.equal((await recoverRuns(prisma, queue, { log: silent })).spent, "gave-up");
  const after = await attemptsOf("spent");
  assert.equal(after.status, "FAILED");
  assert.ok(after.completedAt instanceof Date);
  assert.equal(after.n, MAX_RECOVERY_ATTEMPTS, "not incremented past the limit");
  assert.equal(queue.jobs.size, 0, "not re-queued");
  const alert = (await sql.query(`SELECT "userId", "zapId", "message" FROM "Alert" WHERE "zapRunId" = 'spent'`)).rows;
  assert.equal(alert.length, 1);
  assert.equal(alert[0].userId, "u1");
  assert.match(alert[0].message, /couldn't restart this run after 3 attempts/);

  // The guarded transition on a run that is already finished (it finished after being read).
  await insertRun("finished-meanwhile", "SUCCESS", { attempts: MAX_RECOVERY_ATTEMPTS });
  const { count } = await prisma.zapRun.updateMany({
    where: { id: "finished-meanwhile", status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: "FAILED", completedAt: new Date() },
  });
  assert.equal(count, 0);
  assert.equal((await attemptsOf("finished-meanwhile")).status, "SUCCESS");
});

test("crash window: the claim is committed before the job is added; a failure in between spends one attempt", { skip }, async () => {
  await sql.query(`UPDATE "ZapRun" SET "status" = 'SUCCESS' WHERE "status" IN ('QUEUED', 'RUNNING')`);
  await insertRun("crash", "RUNNING", { startedMinutesAgo: 30 });
  const broken = { ...fakeQueue(), async add() { throw new Error("Redis connection lost"); } };
  await assert.rejects(recoverRuns(prisma, broken, { log: silent }), /Redis connection lost/);
  assert.equal((await attemptsOf("crash")).n, 1, "the attempt is durable although no job was added");

  const queue = fakeQueue();
  assert.equal((await recoverRuns(prisma, queue, { log: silent, now: Date.now() + 11 * MIN })).crash, "added");
  assert.equal((await attemptsOf("crash")).n, 2);
});
