/**
 * Connection health: when an app rejects a connected account's token (revoked, expired,
 * app uninstalled), the account is marked "NEEDS_RECONNECT" so the Apps page, dashboard and
 * builder can say so, instead of the trigger silently never firing. Reconnecting through
 * OAuth sets it back to "OK" (apps/server/src/routes/connections/*.js); so does the next
 * successful call with the same token (a false alarm heals itself).
 *
 * The helpers never throw: health bookkeeping must not change how a poll or step ends.
 */
const prisma = require("./prismaClient");
const { SLACK_AUTH_CODES, isAuthFailure } = require("./authFailure");

const NEEDS_RECONNECT = "NEEDS_RECONNECT";
const MAX_ERROR_LENGTH = 500;

/** The connection id a step acts through (API-created Zaps keep fields flat; the builder nests them). */
function stepConnectionId(step) {
  return step?.connectionId || step?.config?.connectionId || step?.config?.config?.connectionId || null;
}

/**
 * Marks the account as needing a reconnect, with the app's error. Only the first failure is
 * recorded: later polls hit the same rejected token, and "since <date>" should stay put.
 */
async function markConnectionBroken(connectionId, err) {
  if (!connectionId) return;
  try {
    const { count } = await prisma.connection.updateMany({
      where: { id: connectionId, status: { not: NEEDS_RECONNECT } },
      data: {
        status: NEEDS_RECONNECT,
        lastError: String(err?.message || err || "The app rejected this account's sign-in.").slice(0, MAX_ERROR_LENGTH),
        lastErrorAt: new Date(),
      },
    });
    if (count > 0) console.warn(`[connections] connection ${connectionId} needs reconnecting: ${err?.message || err}`);
  } catch (updateErr) {
    // Deleted meanwhile, or the database is down: the next failure tries again.
    console.error(`[connections] could not mark connection ${connectionId} as broken:`, updateErr.message);
  }
}

/**
 * Back to "OK" after a call with this account worked. Pass the loaded connection (no query
 * unless it was broken) or just its id (one conditional update).
 */
async function markConnectionHealthy(connectionOrId) {
  const id = typeof connectionOrId === "string" ? connectionOrId : connectionOrId?.id;
  if (!id) return;
  if (typeof connectionOrId === "object" && connectionOrId.status !== NEEDS_RECONNECT) return;
  try {
    const { count } = await prisma.connection.updateMany({
      where: { id, status: NEEDS_RECONNECT },
      data: { status: "OK", lastError: null, lastErrorAt: null },
    });
    if (count > 0) console.log(`[connections] connection ${id} works again`);
  } catch (updateErr) {
    console.error(`[connections] could not mark connection ${id} as healthy:`, updateErr.message);
  }
}

/** Marks the connection broken if `err` is an auth failure. -> whether it was. */
async function noteConnectionError(connectionId, err) {
  if (!connectionId || !isAuthFailure(err)) return false;
  await markConnectionBroken(connectionId, err);
  return true;
}

module.exports = {
  NEEDS_RECONNECT,
  SLACK_AUTH_CODES,
  isAuthFailure,
  stepConnectionId,
  markConnectionBroken,
  markConnectionHealthy,
  noteConnectionError,
};
