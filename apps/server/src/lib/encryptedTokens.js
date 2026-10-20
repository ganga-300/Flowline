/**
 * Prisma client extension: Connection tokens are encrypted when written and decrypted when
 * read, so routes and integrations keep using connection.accessToken as plain text.
 * Used by both the server and the worker (apps/worker/src/prismaClient.js).
 *
 * Without TOKEN_ENCRYPTION_KEY: production refuses to start; development stores tokens as
 * plain text and logs a warning once.
 */
const { parseKey, encryptToken, decryptToken } = require("./tokenCrypto");

const TOKEN_FIELDS = ["accessToken", "refreshToken"];

function encryptFields(data, key) {
  if (!data || typeof data !== "object") return data;
  const out = { ...data };
  for (const field of TOKEN_FIELDS) {
    if (!(field in out)) continue;
    const v = out[field];
    // Prisma also accepts { set: value } for updates.
    out[field] = v && typeof v === "object" && "set" in v ? { ...v, set: encryptToken(v.set, key) } : encryptToken(v, key);
  }
  return out;
}

function withEncryptedTokens(prisma, { env = process.env, log = console } = {}) {
  const key = parseKey(env.TOKEN_ENCRYPTION_KEY);
  if (!key) {
    if (env.NODE_ENV === "production") {
      throw new Error("TOKEN_ENCRYPTION_KEY is required in production (OAuth tokens are encrypted at rest).");
    }
    log.warn("[security] TOKEN_ENCRYPTION_KEY is not set: OAuth tokens are stored unencrypted (development only).");
    return prisma;
  }

  const encryptArgs = (args) => {
    if (Array.isArray(args.data)) return { ...args, data: args.data.map((d) => encryptFields(d, key)) };
    return { ...args, data: encryptFields(args.data, key) };
  };

  return prisma.$extends({
    name: "encryptedTokens",
    query: {
      connection: {
        create: ({ args, query }) => query(encryptArgs(args)),
        createMany: ({ args, query }) => query(encryptArgs(args)),
        update: ({ args, query }) => query(encryptArgs(args)),
        updateMany: ({ args, query }) => query(encryptArgs(args)),
        upsert: ({ args, query }) =>
          query({ ...args, create: encryptFields(args.create, key), update: encryptFields(args.update, key) }),
      },
    },
    result: {
      connection: {
        accessToken: { needs: { accessToken: true }, compute: (c) => decryptToken(c.accessToken, key) },
        refreshToken: { needs: { refreshToken: true }, compute: (c) => decryptToken(c.refreshToken, key) },
      },
    },
  });
}

module.exports = { withEncryptedTokens, encryptFields };
