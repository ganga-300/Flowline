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
 * GET /connections/github/start
 * Initiates the GitHub OAuth flow
 */
router.get("/start", authMiddleware, (req, res) => {
  const userId = req.userId;
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = process.env.GITHUB_REDIRECT_URI || "http://localhost:4000/connections/github/callback";

  if (!clientId) {
    return res.status(500).json({
      error: "GITHUB_CLIENT_ID is not configured on server",
    });
  }

  const stateToken = jwt.sign(
    { userId, provider: "github", nonce: Math.random().toString(36).substring(2) },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );

  const scopes = ["repo", "user:email"];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    state: stateToken,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

/**
 * GET /connections/github/callback
 * Handles GitHub OAuth callback
 */
router.get("/callback", async (req, res) => {
  const { code, state, error: ghError } = req.query;
  const frontendAppUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  if (ghError) {
    return res.redirect(`${frontendAppUrl}/connections?error=${encodeURIComponent(`GitHub OAuth denied: ${ghError}`)}`);
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

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const redirectUri = process.env.GITHUB_REDIRECT_URI || "http://localhost:4000/connections/github/callback";

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.redirect(`${frontendAppUrl}/connections?error=${encodeURIComponent(tokenData.error_description || "GitHub token exchange failed")}`);
    }

    // Fetch user profile from GitHub
    let username = "";
    try {
      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "User-Agent": "Flowline-App",
        },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        username = userData.login || "";
      }
    } catch (err) {
      console.warn("[GitHub OAuth] Could not fetch user profile:", err.message);
    }

    const providerValue = username ? `github:${username}` : "github";

    const connection = await prisma.connection.create({
      data: {
        provider: providerValue,
        accessToken: tokenData.access_token,
        userId: req.userId,
      },
    });

    return res.redirect(`${frontendAppUrl}/connections?connected=github&connectionId=${connection.id}`);
  } catch (err) {
    console.error("[GitHub OAuth Callback Error]:", err);
    return res.redirect(`${frontendAppUrl}/connections?error=${encodeURIComponent(err.message || "OAuth processing failed")}`);
  }
});

/**
 * GET /connections/github/repos
 * Query options:
 * - owner (optional): GitHub username or org name (e.g. 'openfoodfacts')
 * - connectionId (optional): specific GitHub connection ID
 */
router.get("/repos", requireAuth, async (req, res) => {
  const { connectionId, owner } = req.query;

  let accessToken = null;
  if (connectionId) {
    const conn = await prisma.connection.findFirst({
      where: { id: connectionId, userId: req.userId },
    });
    if (conn) accessToken = conn.accessToken;
  } else {
    const defaultConn = await prisma.connection.findFirst({
      where: { userId: req.userId, provider: { startsWith: "github" } },
      orderBy: { createdAt: "desc" },
    });
    if (defaultConn) accessToken = defaultConn.accessToken;
  }

  const headers = {
    "User-Agent": "Flowline-App",
    Accept: "application/vnd.github.v3+json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    if (owner && owner.trim()) {
      const cleanOwner = encodeURIComponent(owner.trim());
      let url = `https://api.github.com/orgs/${cleanOwner}/repos?per_page=100&sort=updated`;
      let ghRes = await fetch(url, { headers });

      if (!ghRes.ok) {
        url = `https://api.github.com/users/${cleanOwner}/repos?per_page=100&sort=updated`;
        ghRes = await fetch(url, { headers });
      }

      if (!ghRes.ok) {
        return res.status(ghRes.status).json({
          error: `Could not fetch repositories for "${owner}". ${ghRes.statusText}`,
          repos: [],
        });
      }

      const repos = await ghRes.json();
      return res.json({
        repos: Array.isArray(repos)
          ? repos.map((r) => ({
              full_name: r.full_name,
              name: r.name,
              description: r.description || "",
              private: r.private || false,
              stars: r.stargazers_count || 0,
            }))
          : [],
      });
    }

    // No owner specified: fetch user's own repositories
    if (!accessToken) {
      return res.status(200).json({
        hasConnection: false,
        repos: [],
        message: "No GitHub connection found. Connect your GitHub account to see your personal repos.",
      });
    }

    const url = "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member";
    const ghRes = await fetch(url, { headers });

    if (!ghRes.ok) {
      return res.status(ghRes.status).json({
        error: `Failed to fetch your repositories: ${ghRes.statusText}`,
        repos: [],
      });
    }

    const repos = await ghRes.json();
    return res.json({
      hasConnection: true,
      repos: Array.isArray(repos)
        ? repos.map((r) => ({
            full_name: r.full_name,
            name: r.name,
            description: r.description || "",
            private: r.private || false,
            stars: r.stargazers_count || 0,
          }))
        : [],
    });
  } catch (err) {
    console.error("[GitHub repos fetch error]:", err.message);
    return res.status(500).json({ error: err.message, repos: [] });
  }
});

module.exports = router;
