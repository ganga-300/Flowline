const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");
const bcrypt = require("bcrypt");
const { signSessionToken } = require("../lib/authTokens");
const { lockedForSeconds, recordFailure, clearFailures } = require("../lib/loginThrottle");
const requireAuth = require("../middleware/auth");
const { sendEmail, appUrl, passwordResetEmail } = require("../../../worker/src/email");

// GitHub/Slack/Gmail accounts are connected through /connections/<app>/start (routes/connections).

router.get("/connections", requireAuth, async (req, res) => {
  const connections = await prisma.connection.findMany({
    where: { userId: req.userId },
    select: { id: true, provider: true, createdAt: true },
  });
  res.json({ connections });
});

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt ignores everything after 72 bytes
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WRONG_LOGIN = "Incorrect email or password.";

// Emails are stored trimmed and lower-cased, so "Ana@X.com" and "ana@x.com" are one account.
const normalizeEmail = (email) => email.trim().toLowerCase();

// Both fields must be non-empty text (anything else would reach Prisma/bcrypt and cause a 500).
function credentialsError(email, password) {
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    return "Enter your email and password.";
  }
  return null;
}

function newPasswordError(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters for your password.`;
  return null;
}

// Accounts created before emails were normalized may be stored with capitals.
async function findUserByEmail(email) {
  return (
    (await prisma.user.findUnique({ where: { email } })) ||
    (await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } }))
  );
}

const publicUser = (user) => ({ id: user.id, email: user.email, createdAt: user.createdAt, emailAlerts: user.emailAlerts ?? true });

router.post("/signup", async (req, res) => {
  const { password } = req.body || {};
  const inputError = credentialsError(req.body?.email, password);
  if (inputError) {
    return res.status(400).json({ error: inputError });
  }
  const email = normalizeEmail(req.body.email);
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  const passwordError = newPasswordError(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  // Case-insensitive: older accounts may be stored with capitals.
  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing) {
    return res.status(400).json({ error: "An account with this email already exists. Log in instead." });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashedPassword },
  });

  const token = signSessionToken(user.id, user.tokenVersion ?? 0);

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

  const user = await findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    recordFailure(email);
    return res.status(401).json({ error: WRONG_LOGIN });
  }
  clearFailures(email);

  const token = signSessionToken(user.id, user.tokenVersion ?? 0);

  res.status(200).json({ token, user: { id: user.id, email: user.email } });
});

// ── The signed-in account (Settings) ──

/** GET /auth/me - the signed-in account. */
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "Account not found." });
  res.json({ user: publicUser(user) });
});

/** PATCH /auth/me - account preferences: { emailAlerts: boolean }. */
router.patch("/me", requireAuth, async (req, res) => {
  const { emailAlerts } = req.body || {};
  if (typeof emailAlerts !== "boolean") return res.status(400).json({ error: "emailAlerts must be true or false." });
  const user = await prisma.user.update({ where: { id: req.userId }, data: { emailAlerts } });
  res.json({ user: publicUser(user) });
});

/**
 * POST /auth/change-password - { currentPassword, newPassword }. Ends every other session
 * (the token version changes) and returns a new token for this one.
 */
router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "Account not found." });
  if (typeof currentPassword !== "string" || !(await bcrypt.compare(currentPassword, user.password))) {
    return res.status(400).json({ error: "Your current password is incorrect." });
  }
  const passwordError = newPasswordError(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(newPassword, 10), tokenVersion: { increment: 1 } },
  });
  res.json({ token: signSessionToken(updated.id, updated.tokenVersion) });
});

/** POST /auth/logout-all - ends every session of this account, including this one. */
router.post("/logout-all", requireAuth, async (req, res) => {
  await prisma.user.update({ where: { id: req.userId }, data: { tokenVersion: { increment: 1 } } });
  res.json({ success: true });
});

/**
 * DELETE /auth/account - { password }. Deletes the account and, through the database's
 * cascades, its Flows (triggers, steps, runs), connected accounts and alerts.
 */
router.delete("/account", requireAuth, async (req, res) => {
  const { password } = req.body || {};
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "Account not found." });
  if (typeof password !== "string" || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: "That password is incorrect, so the account wasn't deleted." });
  }
  await prisma.user.delete({ where: { id: user.id } });
  res.json({ success: true });
});

// ── Forgot / reset password ──

const RESET_TTL_MS = 60 * 60 * 1000;
const RESET_LIMIT = 3; // reset emails per address per hour
const resetRequests = new Map(); // email -> [timestamps]
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

function tooManyResets(email, now = Date.now()) {
  const recent = (resetRequests.get(email) || []).filter((t) => now - t < RESET_TTL_MS);
  if (recent.length >= RESET_LIMIT) return true;
  resetRequests.set(email, [...recent, now]);
  if (resetRequests.size > 10_000) resetRequests.delete(resetRequests.keys().next().value);
  return false;
}

/**
 * POST /auth/forgot-password - { email }. Always answers the same way, so it can't be used
 * to find out which emails have accounts; an existing account gets a one-hour reset link.
 */
router.post("/forgot-password", async (req, res) => {
  const email = typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: "Enter a valid email address." });

  const answer = { success: true, message: "If an account exists for that email, a reset link is on its way. It expires in 1 hour." };
  if (tooManyResets(email)) return res.json(answer);

  const user = await findUserByEmail(email);
  if (!user) return res.json(answer);

  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  const resetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({ to: user.email, ...passwordResetEmail({ resetUrl }) });
  res.json(answer);
});

/**
 * POST /auth/reset-password - { token, password }. Sets the new password, ends every
 * existing session, and signs this browser in.
 */
router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== "string" || !token) return res.status(400).json({ error: "This reset link is incomplete. Request a new one." });

  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: "This reset link has expired or was already used. Request a new one." });
  }
  const passwordError = newPasswordError(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { password: await bcrypt.hash(password, 10), tokenVersion: { increment: 1 } },
    }),
    // Every outstanding link for this account stops working, not just this one.
    prisma.passwordResetToken.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  clearFailures(normalizeEmail(user.email));
  res.json({ token: signSessionToken(user.id, user.tokenVersion), user: { id: user.id, email: user.email } });
});

module.exports = router;
module.exports.hashToken = hashToken;
