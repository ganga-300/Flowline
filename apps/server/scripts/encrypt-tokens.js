/**
 * One-off: encrypts OAuth tokens saved before TOKEN_ENCRYPTION_KEY was set.
 * Safe to run more than once (already-encrypted values are skipped).
 *   node scripts/encrypt-tokens.js           # encrypt
 *   node scripts/encrypt-tokens.js --dry-run # only count
 * Prints counts only, never token values.
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { parseKey, isEncrypted, encryptToken } = require("../src/lib/tokenCrypto");

(async () => {
  const key = parseKey(process.env.TOKEN_ENCRYPTION_KEY);
  if (!key) throw new Error("Set TOKEN_ENCRYPTION_KEY first (see apps/server/src/lib/tokenCrypto.js).");
  const dryRun = process.argv.includes("--dry-run");
  // Plain client on purpose: we need to see and write the stored values as they are.
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  const rows = await prisma.connection.findMany({ select: { id: true, accessToken: true, refreshToken: true } });
  let changed = 0;
  for (const row of rows) {
    const data = {};
    if (row.accessToken && !isEncrypted(row.accessToken)) data.accessToken = encryptToken(row.accessToken, key);
    if (row.refreshToken && !isEncrypted(row.refreshToken)) data.refreshToken = encryptToken(row.refreshToken, key);
    if (Object.keys(data).length === 0) continue;
    changed++;
    if (!dryRun) await prisma.connection.update({ where: { id: row.id }, data });
  }
  console.log(`${rows.length} connections, ${changed} ${dryRun ? "would be encrypted" : "encrypted"}, ${rows.length - changed} already encrypted or empty.`);
  await prisma.$disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
