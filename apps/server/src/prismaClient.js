const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { withEncryptedTokens } = require("./lib/encryptedTokens");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
// OAuth tokens are encrypted at rest and decrypted on read (see lib/encryptedTokens.js).
const prisma = withEncryptedTokens(new PrismaClient({ adapter }));

module.exports = prisma;
