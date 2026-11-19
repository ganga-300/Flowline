const { fetchWithTimeout } = require("../../fetchWithTimeout");

/**
 * Refreshes an expired Google OAuth access token using the stored refresh token
 * and persists the newly issued access token to the database.
 * 
 * @param {string} connectionId
 * @param {string} refreshToken
 * @param {{ db?: object }} [options] db: the Prisma client to save with (the API passes its
 *   own; the worker's is loaded only when needed, so the API doesn't open a second pool).
 * @returns {Promise<string>} newAccessToken
 */
async function refreshGoogleAccessToken(connectionId, refreshToken, { db } = {}) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Cannot refresh Google token: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing from environment");
  }

  const tokenRes = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const tokenData = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok || tokenData.error) {
    const errorMsg = tokenData.error_description || tokenData.error || `HTTP ${tokenRes.status}`;
    console.error(`[google:auth] Token refresh failed for connection ${connectionId}:`, errorMsg);
    // invalid_grant: the refresh token was revoked or expired (password change, access
    // removed in the Google account, unverified app's 7-day limit). Only a reconnect fixes it.
    if (tokenData.error === "invalid_grant") {
      const err = new Error(`Google no longer accepts this Gmail connection (${errorMsg}). Reconnect Gmail on the Apps page.`);
      err.authFailed = true;
      throw err;
    }
    throw new Error(`Google token refresh failed: ${errorMsg}`);
  }

  const newAccessToken = tokenData.access_token;

  // Persist updated accessToken to database
  await (db || require("../../prismaClient")).connection.update({
    where: { id: connectionId },
    data: { accessToken: newAccessToken },
  });

  return newAccessToken;
}

module.exports = { refreshGoogleAccessToken };
