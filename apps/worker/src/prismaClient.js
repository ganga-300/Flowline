const { PrismaClient } = require("../../server/node_modules/@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { withEncryptedTokens } = require("../../server/src/lib/encryptedTokens");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
// Same client setup as the server: OAuth tokens are decrypted on read, encrypted on write.
const prisma = withEncryptedTokens(new PrismaClient({ adapter }));

module.exports = prisma;
