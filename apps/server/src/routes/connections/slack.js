const express = require("express");
const { fetchWithTimeout } = require("../../../../worker/src/fetchWithTimeout");
const { signOAuthState, verifyOAuthState, safeReturnUrl } = require("../../lib/authTokens");
const router = express.Router();
const prisma = require("../../prismaClient");
const requireAuth = require("../../middleware/auth");
const { allowedOrigins } = require("../../config");

const authMiddleware = (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  requireAuth(req, res, next);
};

/**
 * GET /connections/slack/start
 * Initiates the Slack OAuth 2.0 flow
 */
router.get("/start", authMiddleware, (req, res) => {
  const userId = req.userId;
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_REDIRECT_URI || "http://localhost:4000/connections/slack/callback";

  if (!clientId) {
    return res.status(500).json({
      error: "SLACK_CLIENT_ID is not configured on server",
    });
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
    const providerValue = `slack:${knownTeamName || "Workspace"}`;

    // Reconnecting the same workspace refreshes its existing row instead of adding a
    // duplicate. The "Workspace" placeholder doesn't identify a workspace, so always create then.
    const existing = knownTeamName
      ? await prisma.connection.findFirst({
          where: { userId: req.userId, provider: providerValue },
          orderBy: { createdAt: "desc" },
        })
      : null;

    const connection = existing
      ? await prisma.connection.update({
          where: { id: existing.id },
          data: { accessToken: tokenData.access_token },
        })
      : await prisma.connection.create({
          data: {
            provider: providerValue,
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

module.exports = router;
