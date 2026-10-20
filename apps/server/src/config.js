/**
 * Environment settings shared by the server and the worker. Fails fast with a clear list
 * of what's missing instead of crashing later (e.g. on the first OAuth callback).
 * Local defaults keep `npm run dev` working without extra setup.
 */
const isProduction = process.env.NODE_ENV === "production";

const OAUTH_APPS = {
  GitHub: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_REDIRECT_URI"],
  Gmail: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"],
  Slack: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "SLACK_REDIRECT_URI"],
};

const redisUrl = () => process.env.REDIS_URL || "redis://localhost:6380";

/** Browser origins allowed to call the API (comma-separated FRONTEND_URL). */
function allowedOrigins(env = process.env) {
  return (env.FRONTEND_URL || "http://localhost:3000")
    .split(",")
    .map((u) => u.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/**
 * role: "server" | "worker". Throws if required settings are missing; warns (doesn't fail)
 * for apps that aren't configured, since those just can't be connected.
 */
function checkEnv(role, env = process.env, log = console) {
  const required = ["DATABASE_URL"];
  if (role === "server") required.push("JWT_SECRET");
  if (env.NODE_ENV === "production") required.push("REDIS_URL", "TOKEN_ENCRYPTION_KEY");
  if (env.NODE_ENV === "production" && role === "server") required.push("FRONTEND_URL");

  const missing = required.filter((k) => !env[k] || !String(env[k]).trim());
  if (missing.length) {
    throw new Error(`[config] Missing environment variables for the ${role}: ${missing.join(", ")}. See .env.example.`);
  }

  for (const [app, keys] of Object.entries(OAUTH_APPS)) {
    // The worker only needs Google's id/secret (to refresh Gmail tokens).
    const needed = role === "worker" ? (app === "Gmail" ? keys.slice(0, 2) : []) : env.NODE_ENV === "production" ? keys : keys.slice(0, 2);
    const absent = needed.filter((k) => !env[k]);
    if (absent.length) log.warn(`[config] ${app} is not fully configured (${absent.join(", ")}); connecting ${app} won't work.`);
  }
}

module.exports = { isProduction, redisUrl, allowedOrigins, checkEnv, OAUTH_APPS };
