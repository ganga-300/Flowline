const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");

// Step 1: user ko GitHub ki authorization page pe bhejo
router.get("/github", (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: "http://localhost:4000/auth/github/callback",
    scope: "repo",
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// Step 2: GitHub yahan wapas bhejta hai, ?code=... ke saath
router.get("/github/callback", async (req, res) => {
  const { code } = req.query;

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json", // GitHub default mein form-encoded deta hai, JSON chahiye
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    return res.status(400).json({ error: tokenData.error_description });
  }

  const connection = await prisma.connection.create({
    data: {
      provider: "github",
      accessToken: tokenData.access_token,
    },
  });

  res.json({ connected: true, connectionId: connection.id, provider: "github" });
});

router.get("/connections", async (req, res) => {
  const connections = await prisma.connection.findMany({
    select: { id: true, provider: true, createdAt: true },
  });
  res.json({ connections });
});

module.exports = router;