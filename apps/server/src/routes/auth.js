const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");
const bcrypt = require("bcrypt");
const { signSessionToken } = require("../lib/authTokens");
const { lockedForSeconds, recordFailure, clearFailures } = require("../lib/loginThrottle");
const requireAuth = require("../middleware/auth");

// GitHub/Slack/Gmail accounts are connected through /connections/<app>/start (routes/connections).

router.get("/connections", requireAuth, async (req, res) => {
  const connections = await prisma.connection.findMany({
    where: { userId: req.userId },
    select: { id: true, provider: true, createdAt: true },
  });
  res.json({ connections });
});

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Emails are stored trimmed and lower-cased, so "Ana@X.com" and "ana@x.com" are one account.
const normalizeEmail = (email) => email.trim().toLowerCase();

// Both fields must be non-empty text (anything else would reach Prisma/bcrypt and cause a 500).
function credentialsError(email, password) {
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    return "email and password are required";
  }
  return null;
}

router.post("/signup", async (req, res) => {
  const { password } = req.body || {};
  const inputError = credentialsError(req.body?.email, password);
  if (inputError) {
    return res.status(400).json({ error: inputError });
  }
  const email = normalizeEmail(req.body.email);
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  // Case-insensitive: older accounts may be stored with capitals.
  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing) {
    return res.status(400).json({ error: "email already registered" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashedPassword },
  });

  const token = signSessionToken(user.id);

  res.status(201).json({ token, user: { id: user.id, email: user.email } });
});

router.post("/login", async (req, res) => {
  const { password } = req.body || {};
  const inputError = credentialsError(req.body?.email, password);
  if (inputError) {
    return res.status(400).json({ error: inputError });
  }
  const email = normalizeEmail(req.body.email);

  const waitSeconds = lockedForSeconds(email);
  if (waitSeconds > 0) {
    res.set("Retry-After", String(waitSeconds));
    return res.status(429).json({ error: `Too many failed login attempts. Try again in ${Math.ceil(waitSeconds / 60)} minutes.` });
  }

  // Accounts created before emails were normalized may be stored with capitals.
  const user =
    (await prisma.user.findUnique({ where: { email } })) ||
    (await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } }));
  if (!user || !(await bcrypt.compare(password, user.password))) {
    recordFailure(email);
    return res.status(401).json({ error: "invalid email or password" });
  }
  clearFailures(email);

  const token = signSessionToken(user.id);

  res.status(200).json({ token, user: { id: user.id, email: user.email } });
});


module.exports = router;