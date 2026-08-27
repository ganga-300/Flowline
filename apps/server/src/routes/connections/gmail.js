const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const prisma = require("../../prismaClient");
const requireAuth = require("../../middleware/auth");

// Helper middleware: support token in query parameter for browser redirects
const authMiddleware = (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  requireAuth(req, res, next);
};

/**
 * GET /connections/gmail/start
 * Initiates the Google OAuth 2.0 flow for Gmail permissions.
 * Expects JWT token in Authorization header or query parameter `token`.
 */
router.get("/start", authMiddleware, (req, res) => {
  const userId = req.userId;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/connections/gmail/callback";

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: "Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) are not configured on server",
      missingEnv: [
        !clientId && "GOOGLE_CLIENT_ID",
        !clientSecret && "GOOGLE_CLIENT_SECRET",
      ].filter(Boolean),
    });
  }

  // Create signed state token containing userId for CSRF protection and account binding
  const stateToken = jwt.sign(
    { userId, provider: "gmail", nonce: Math.random().toString(36).substring(2) },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );

  const scopes = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: stateToken,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

/**
 * GET /connections/gmail/callback
 * Handles Google OAuth 2.0 redirect callback.
 * Validates state token, exchanges code for access/refresh tokens, fetches email, and persists connection.
 */
router.get("/callback", async (req, res) => {
  const { code, state, error: googleError } = req.query;

  const frontendAppUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  if (googleError) {
    return res.redirect(`${frontendAppUrl}/zaps/new?error=${encodeURIComponent(`Google OAuth denied: ${googleError}`)}`);
  }

  if (!code || !state) {
    return res.redirect(`${frontendAppUrl}/zaps/new?error=${encodeURIComponent("Missing authorization code or state token")}`);
  }

  let decodedState;
  try {
    decodedState = jwt.verify(state, process.env.JWT_SECRET);
    req.userId = decodedState.userId;
  } catch {
    return res.redirect(`${frontendAppUrl}/zaps/new?error=${encodeURIComponent("Invalid or expired OAuth state token")}`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/connections/gmail/callback";

  try {
    // 1. Server-side authorization code exchange for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      const errMsg = tokenData.error_description || tokenData.error || "Token exchange failed";
      return res.redirect(`${frontendAppUrl}/zaps/new?error=${encodeURIComponent(errMsg)}`);
    }

    // 2. Fetch user identity (email) from Google UserInfo endpoint
    let accountEmail = "";
    if (tokenData.access_token) {
      try {
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (userInfoRes.ok) {
          const userInfo = await userInfoRes.json();
          accountEmail = userInfo.email || "";
        }
      } catch (err) {
        console.warn("[Gmail OAuth] Unable to fetch userinfo:", err.message);
      }
    }

    const providerValue = accountEmail ? `gmail:${accountEmail}` : "gmail";

    // 3. Persist connection record in database linked to req.userId
    const connection = await prisma.connection.create({
      data: {
        provider: providerValue,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        userId: req.userId,
      },
    });

    // 4. Redirect user back to builder with connection ID
    return res.redirect(`${frontendAppUrl}/zaps/new?connected=gmail&connectionId=${connection.id}`);
  } catch (err) {
    console.error("[Gmail OAuth Callback Error]:", err);
    return res.redirect(`${frontendAppUrl}/zaps/new?error=${encodeURIComponent(err.message || "OAuth processing failed")}`);
  }
});

module.exports = router;
