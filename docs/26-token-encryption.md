# OAuth token encryption at rest

GitHub, Slack and Gmail tokens (`Connection.accessToken`, `Connection.refreshToken`) are
encrypted before they are written to Postgres and decrypted when read.

- **Cipher:** AES-256-GCM, random 12-byte IV per value, auth tag checked on every read
  (a modified value fails instead of decrypting to garbage). Stored as `enc:v1:<iv>:<tag>:<ciphertext>`.
- **Where:** a Prisma client extension (`apps/server/src/lib/encryptedTokens.js`) used by both the
  server and the worker. Routes and integrations still read `connection.accessToken` as plain
  text, including through nested reads such as `trigger.connection`.
- **Key:** `TOKEN_ENCRYPTION_KEY`, 32 random bytes (base64 or hex). The server and worker must use
  the **same** key. Generate one with
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- **Without a key:** production (`NODE_ENV=production`) refuses to start; development stores tokens
  unencrypted and logs a warning.
- **Existing tokens:** values without the `enc:v1:` prefix are read as plain text, so nothing breaks
  when the key is first added. Encrypt them once with `cd apps/server && node scripts/encrypt-tokens.js`
  (`--dry-run` to count first). Safe to run again.
- **Losing the key** makes stored tokens unreadable; users would have to reconnect their apps.

Verified against a real Postgres (bench harness): stored values are ciphertext, reads (including
`include: { connection: true }`) return plain text, token refresh updates are encrypted, legacy
plaintext rows still read, and the conversion script is idempotent. Unit tests:
`apps/server/test/tokenCrypto.test.js`.
