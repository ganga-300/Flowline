/**
 * Encryption at rest for OAuth tokens (Connection.accessToken / refreshToken).
 * AES-256-GCM with a random 12-byte IV per value; the auth tag detects tampering.
 * Stored format: "enc:v1:<iv>:<tag>:<ciphertext>" (base64url parts).
 *
 * Key: TOKEN_ENCRYPTION_KEY = 32 random bytes as base64 or hex, e.g.
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Values without the "enc:v1:" prefix are treated as plaintext from before encryption
 * was enabled, so existing connections keep working (scripts/encrypt-tokens.js converts them).
 */
const crypto = require("crypto");

const PREFIX = "enc:v1:";

function parseKey(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(trimmed) ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 or 64 hex characters).");
  }
  return key;
}

function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

function encryptToken(plaintext, key) {
  if (plaintext === null || plaintext === undefined || isEncrypted(plaintext)) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ciphertext].map((b) => b.toString("base64url")).join(":");
}

function decryptToken(value, key) {
  if (!isEncrypted(value)) return value; // plaintext from before encryption, or null
  if (!key) throw new Error("This token is encrypted but TOKEN_ENCRYPTION_KEY is not set.");
  const [iv, tag, ciphertext] = value.slice(PREFIX.length).split(":").map((p) => Buffer.from(p, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

module.exports = { PREFIX, parseKey, isEncrypted, encryptToken, decryptToken };
