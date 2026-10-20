// Starting an OAuth connection: the browser goes to the Flowline server, which redirects
// to GitHub/Slack/Google and, afterwards, back to `returnPath` with ?connected= or ?error=.
import { API_BASE_URL } from "./api.js";

export function buildOAuthStartUrl({ apiBase = API_BASE_URL, provider, token, returnPath = "/connections" }) {
  const params = new URLSearchParams({ token, returnUrl: returnPath });
  return `${apiBase}/connections/${encodeURIComponent(provider)}/start?${params.toString()}`;
}

/** Sends the browser to the OAuth start URL. Returns false if the user isn't signed in. */
export function startOAuth(provider, returnPath) {
  const token = typeof window !== "undefined" ? localStorage.getItem("flowline_token") : null;
  if (!token) return false;
  window.location.href = buildOAuthStartUrl({
    provider,
    token,
    returnPath: returnPath ?? window.location.pathname + window.location.search,
  });
  return true;
}

/** Reads ?connected= / ?error= after an OAuth round trip. */
export function readOAuthResult(search) {
  const params = new URLSearchParams(search);
  const connected = params.get("connected");
  const error = params.get("error");
  if (error) return { tone: "danger", message: error };
  if (connected) return { tone: "success", provider: connected };
  return null;
}
