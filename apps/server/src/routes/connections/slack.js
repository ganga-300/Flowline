const express = require("express");
const { fetchWithTimeout } = require("../../../../worker/src/fetchWithTimeout");
const { signOAuthState, verifyOAuthState, safeReturnUrl } = require("../../lib/authTokens");
const router = express.Router();
const prisma = require("../../prismaClient");
const { allowedOrigins } = require("../../config");
const { oauthStartAuth, redirectWithError, notConfiguredMessage } = require("../../lib/oauthStart");

/**
 * GET /connections/slack/start
 * Initiates the Slack OAuth 2.0 flow
 */
router.get("/start", oauthStartAuth, (req, res) => {
  const userId = req.userId;
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_REDIRECT_URI || "http://localhost:4000/connections/slack/callback";

  if (!clientId) {
    return redirectWithError(res, req.query.returnUrl, notConfiguredMessage("Slack", ["SLACK_CLIENT_ID"]));
  }

  const stateToken = signOAuthState({ userId, provider: "slack", returnUrl: req.query.returnUrl });

  const scopes = [
    "chat:write",
    "channels:read",
    "channels:history",
    "groups:read",
    "groups:history",
    "im:read",
    "im:history",
    "mpim:read",
    "mpim:history",
    "users:read",
    "users:read.email",
    "chat:write.public",
    "channels:join", // lets the "New Message" trigger join public channels it must read
    "im:write", // lets "Send Direct Message" open a DM with the user
  ];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(","),
    state: stateToken,
  });

  res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
});

/**
 * GET /connections/slack/callback
 * Handles Slack OAuth 2.0 callback
 */
router.get("/callback", async (req, res) => {
  const { code, state, error: slackError } = req.query;
  const frontendAppUrl = allowedOrigins()[0]; // first FRONTEND_URL entry

  let decodedState = {};
  try {
    if (state) {
      decodedState = verifyOAuthState(state, "slack");
      req.userId = decodedState.userId;
    }
  } catch {
    // continue
  }

  const returnUrl = safeReturnUrl(decodedState.returnUrl);
  const redirectSep = returnUrl.includes("?") ? "&" : "?";

  if (slackError) {
    return res.redirect(`${frontendAppUrl}${returnUrl}${redirectSep}error=${encodeURIComponent(`Slack OAuth denied: ${slackError}`)}`);
  }

  if (!code || !state || !req.userId) {
    return res.redirect(`${frontendAppUrl}${returnUrl}${redirectSep}error=${encodeURIComponent("Missing authorization code or state token")}`);
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_REDIRECT_URI || "http://localhost:4000/connections/slack/callback";

  try {
    const tokenRes = await fetchWithTimeout("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.ok) {
      // Log Slack's error code only (never tokens) so failed installs are diagnosable.
      console.warn(`[Slack OAuth] oauth.v2.access failed: ${tokenData.error || `HTTP ${tokenRes.status}`}`);
      return res.redirect(`${frontendAppUrl}${returnUrl}${redirectSep}error=${encodeURIComponent(tokenData.error || "Slack token exchange failed")}`);
    }

    const knownTeamName = tokenData.team?.name || "";
    const teamId = tokenData.team?.id || null;
    const providerValue = `slack:${knownTeamName || "Workspace"}`;

    const existing = await findExistingWorkspace(req.userId, teamId, knownTeamName && providerValue);

    const connection = existing
      ? await prisma.connection.update({
          where: { id: existing.id },
          data: {
            accessToken: tokenData.access_token,
            // The workspace may have been renamed since; the team id is what identifies it.
            ...(knownTeamName && { provider: providerValue }),
            ...(teamId && { externalId: teamId }),
            // A fresh token: whatever made the account "needs reconnect" is resolved.
            status: "OK",
            lastError: null,
            lastErrorAt: null,
          },
        })
      : await prisma.connection.create({
          data: {
            provider: providerValue,
            externalId: teamId,
            accessToken: tokenData.access_token,
            userId: req.userId,
          },
        });

    return res.redirect(`${frontendAppUrl}${returnUrl}${redirectSep}connected=slack&connectionId=${connection.id}`);
  } catch (err) {
    console.error("[Slack OAuth Callback Error]:", err);
    return res.redirect(`${frontendAppUrl}${returnUrl}${redirectSep}error=${encodeURIComponent(err.message || "OAuth processing failed")}`);
  }
});

/**
 * The user's existing connection to this workspace, so reconnecting refreshes it instead of
 * adding a duplicate: matched by Slack team id; rows saved before the id was stored are
 * matched by workspace name (only those without an id - another workspace that happens to
 * share the name is not this one). The "Workspace" placeholder identifies nothing.
 */
async function findExistingWorkspace(userId, teamId, providerValue) {
  if (teamId) {
    const byId = await prisma.connection.findFirst({
      where: { userId, externalId: teamId },
      orderBy: { createdAt: "desc" },
    });
    if (byId) return byId;
  }
  if (!providerValue) return null;
  return prisma.connection.findFirst({
    where: { userId, provider: providerValue, externalId: null },
    orderBy: { createdAt: "desc" },
  });
}

module.exports = router;
