// OAuth token encryption at rest (pure crypto + the Prisma extension's write mapping; no DB).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { parseKey, isEncrypted, encryptToken, decryptToken } = require("../src/lib/tokenCrypto");
const { encryptFields, withEncryptedTokens } = require("../src/lib/encryptedTokens");

const keyB64 = crypto.randomBytes(32).toString("base64");
const key = parseKey(keyB64);

test("round trip: encrypted value differs each time and decrypts back", () => {
  const a = encryptToken("xoxb-secret", key);
  const b = encryptToken("xoxb-secret", key);
  assert.ok(isEncrypted(a));
  assert.notEqual(a, b, "random IV per value");
  assert.doesNotMatch(a, /xoxb-secret/);
  assert.equal(decryptToken(a, key), "xoxb-secret");
});

test("tampered ciphertext or the wrong key is rejected", () => {
  const enc = encryptToken("ghp_secret", key);
  const parts = enc.split(":");
  const ct = Buffer.from(parts[4], "base64url");
  ct[0] ^= 1;
  parts[4] = ct.toString("base64url");
  assert.throws(() => decryptToken(parts.join(":"), key));
  assert.throws(() => decryptToken(enc, crypto.randomBytes(32)));
});

test("plaintext from before encryption and nulls pass through; no double encryption", () => {
  assert.equal(decryptToken("old-plain-token", key), "old-plain-token");
  assert.equal(decryptToken(null, key), null);
  assert.equal(encryptToken(null, key), null);
  const enc = encryptToken("t", key);
  assert.equal(encryptToken(enc, key), enc);
});

test("keys: base64 or hex, must be 32 bytes", () => {
  assert.equal(parseKey(crypto.randomBytes(32).toString("hex")).length, 32);
  assert.equal(parseKey(""), null);
  assert.throws(() => parseKey(crypto.randomBytes(16).toString("base64")), /32 bytes/);
});

test("writes: only token fields are encrypted, including { set } updates", () => {
  const out = encryptFields({ provider: "slack:T1", accessToken: "a", refreshToken: { set: "r" }, userId: "u" }, key);
  assert.equal(out.provider, "slack:T1");
  assert.equal(out.userId, "u");
  assert.equal(decryptToken(out.accessToken, key), "a");
  assert.equal(decryptToken(out.refreshToken.set, key), "r");
});

test("no key: refuses in production, plain passthrough with a warning in development", () => {
  const fakeClient = { $extends: () => { throw new Error("should not extend"); } };
  assert.throws(() => withEncryptedTokens(fakeClient, { env: { NODE_ENV: "production" } }), /required in production/);
  const warnings = [];
  assert.equal(withEncryptedTokens(fakeClient, { env: {}, log: { warn: (m) => warnings.push(m) } }), fakeClient);
  assert.equal(warnings.length, 1);
});
