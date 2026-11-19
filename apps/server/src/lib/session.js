/**
 * Checks a login token against the database: the account must still exist and the token's
 * version must match the account's (see signSessionToken). Used by requireAuth and by the
 * OAuth /start routes.
 */
const prisma = require("../prismaClient");
const { verifySessionToken } = require("./authTokens");

const SESSION_ENDED = "Your session has ended. Log in again.";

/** -> the user id for a valid, current token; throws (err.sessionEnded) otherwise. */
async function sessionUserId(token) {
  let decoded;
  try {
    decoded = verifySessionToken(token);
  } catch {
    throw Object.assign(new Error(SESSION_ENDED), { sessionEnded: true });
  }
  const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { tokenVersion: true } });
  // Tokens from before versions existed have no `tv`: they count as version 0.
  if (!user || (decoded.tv ?? 0) !== user.tokenVersion) {
    throw Object.assign(new Error(SESSION_ENDED), { sessionEnded: true });
  }
  return decoded.userId;
}

module.exports = { sessionUserId, SESSION_ENDED };
