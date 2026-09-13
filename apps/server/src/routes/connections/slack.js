const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const prisma = require("../../prismaClient");
const requireAuth = require("../../middleware/auth");

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

  const stateToken = jwt.sign(
    { userId, provider: "slack", nonce: Math.random().toString(36).substring(2) },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );

  const scopes = [
    "chat:write",
    "channels:read",
    "groups:read",
    "im:read",
    "mpim:read",
    "chat:write.public",
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
  const frontendAppUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  if (slackError) {
    return res.redirect(`${frontendAppUrl}/connections?error=${encodeURIComponent(`Slack OAuth denied: ${slackError}`)}`);
  }

  if (!code || !state) {
    return res.redirect(`${frontendAppUrl}/connections?error=${encodeURIComponent("Missing authorization code or state token")}`);
  }

  let decodedState;
  try {
    decodedState = jwt.verify(state, process.env.JWT_SECRET);
    req.userId = decodedState.userId;
  } catch {
    return res.redirect(`${frontendAppUrl}/connections?error=${encodeURIComponent("Invalid or expired OAuth state token")}`);
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_REDIRECT_URI || "http://localhost:4000/connections/slack/callback";

  try {
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
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
      return res.redirect(`${frontendAppUrl}/connections?error=${encodeURIComponent(tokenData.error || "Slack token exchange failed")}`);
    }

    const teamName = tokenData.team?.name || "Workspace";
    const providerValue = `slack:${teamName}`;

    const connection = await prisma.connection.create({
      data: {
        provider: providerValue,
        accessToken: tokenData.access_token,
        userId: req.userId,
      },
    });

    return res.redirect(`${frontendAppUrl}/connections?connected=slack&connectionId=${connection.id}`);
  } catch (err) {
    console.error("[Slack OAuth Callback Error]:", err);
    return res.redirect(`${frontendAppUrl}/connections?error=${encodeURIComponent(err.message || "OAuth processing failed")}`);
  }
});

module.exports = router;
