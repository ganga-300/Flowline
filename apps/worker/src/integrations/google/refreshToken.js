const prisma = require("../../prismaClient");

/**
 * Refreshes an expired Google OAuth access token using the stored refresh token
 * and persists the newly issued access token to the database.
 * 
 * @param {string} connectionId
 * @param {string} refreshToken
 * @returns {Promise<string>} newAccessToken
 */
async function refreshGoogleAccessToken(connectionId, refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Cannot refresh Google token: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing from environment");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || tokenData.error) {
    // If token is invalid or revoked, update connection error status
    const errorMsg = tokenData.error_description || tokenData.error || `HTTP ${tokenRes.status}`;
    console.error(`[google:auth] Token refresh failed for connection ${connectionId}:`, errorMsg);
    throw new Error(`Google token refresh failed: ${errorMsg}`);
  }

  const newAccessToken = tokenData.access_token;

  // Persist updated accessToken to database
  await prisma.connection.update({
    where: { id: connectionId },
    data: { accessToken: newAccessToken },
  });

  return newAccessToken;
}

module.exports = { refreshGoogleAccessToken };
