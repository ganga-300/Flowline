/**
 * Custom HTTP request step (ACTION without a provider): { url, method, body }.
 * Shared by the worker and the builder's "Test" (server routes/testStep.js) so both behave
 * the same.
 *  - {{data}} is filled in the URL and body. In a JSON body only string values are filled,
 *    then the body is re-serialized, so quotes in the data can't break the JSON.
 *  - Non-2xx responses fail the step (429/502/503/504 are retryable, see recovery.js).
 *  - Output: { status, body } (body parsed as JSON when possible, else text, max 10 kB).
 *  - Private/internal addresses are blocked in production (SSRF), see assertPublicUrl.
 */
const dns = require("dns").promises;
const net = require("net");
const { resolveTemplate } = require("../../conditions");
const { retryableError } = require("../../recovery");

const MAX_BODY_CHARS = 10_000;
const TIMEOUT_MS = 15_000;

// URL: values are URL-encoded, except a placeholder at the very start (a whole base URL).
function resolveUrl(template, context) {
  return String(template || "").replace(/\{\{(.+?)\}\}/g, (match, _path, offset) => {
    const value = resolveTemplate(context, match);
    return offset === 0 ? value : encodeURIComponent(value);
  }).trim();
}

function resolveDeep(value, context) {
  if (typeof value === "string") return resolveTemplate(context, value);
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDeep(v, context)]));
  }
  return value;
}

/** -> { text, contentType } or null for no body. */
function buildBody(body, context) {
  if (body === undefined || body === null || body === "") return null;
  if (typeof body === "object") return { text: JSON.stringify(resolveDeep(body, context)), contentType: "application/json" };
  const raw = String(body);
  try {
    // Valid JSON with {{...}} inside strings: fill values safely, then re-serialize.
    return { text: JSON.stringify(resolveDeep(JSON.parse(raw), context)), contentType: "application/json" };
  } catch {
    // e.g. {"count": {{trigger.n}}} - not JSON until filled in; send it as written.
    const text = resolveTemplate(context, raw);
    let isJson = false;
    try {
      JSON.parse(text);
      isJson = true;
    } catch {
      isJson = false;
    }
    return { text, contentType: isJson ? "application/json" : "text/plain; charset=utf-8" };
  }
}

const blocked = new net.BlockList();
for (const [addr, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]]) {
  blocked.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]]) {
  blocked.addSubnet(addr, prefix, "ipv6");
}

function isPrivateAddress(address) {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i); // IPv4-mapped IPv6
  if (mapped) return blocked.check(mapped[1], "ipv4");
  return blocked.check(address, net.isIPv6(address) ? "ipv6" : "ipv4");
}

/** Throws unless the URL is http(s) and every address it resolves to is public. */
async function assertPublicUrl(url, lookup = dns.lookup) {
  const { protocol, hostname } = new URL(url);
  if (protocol !== "http:" && protocol !== "https:") throw new Error("HTTP step: only http and https URLs are allowed.");
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error("HTTP step: requests to private or internal addresses are not allowed.");
  }
}

const allowPrivateByDefault = () =>
  process.env.HTTP_STEP_ALLOW_PRIVATE === "true" || (process.env.NODE_ENV !== "production" && process.env.HTTP_STEP_ALLOW_PRIVATE !== "false");

async function executeHttpRequest(config, context, { fetchImpl = fetch, allowPrivate = allowPrivateByDefault(), lookup } = {}) {
  const method = String(config?.method || "POST").toUpperCase();
  const url = resolveUrl(config?.url, context);
  if (!url) throw new Error("HTTP step: no URL configured.");
  try {
    new URL(url);
  } catch {
    throw new Error(`HTTP step: "${url}" is not a valid URL.`);
  }
  if (!allowPrivate) await assertPublicUrl(url, lookup);

  const body = method === "GET" || method === "HEAD" ? null : buildBody(config?.body, context);
  const res = await fetchImpl(url, {
    method,
    headers: body ? { "Content-Type": body.contentType } : {},
    body: body ? body.text : undefined,
    // Redirects could point at an internal address, so don't follow them when guarding.
    redirect: allowPrivate ? "follow" : "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text().catch(() => "");
  let parsed = text.slice(0, MAX_BODY_CHARS);
  try {
    parsed = JSON.parse(text);
  } catch {
    // not JSON: keep the (truncated) text
  }
  if (!res.ok && !(res.status >= 300 && res.status < 400)) {
    const snippet = typeof parsed === "string" ? parsed.slice(0, 200) : JSON.stringify(parsed).slice(0, 200);
    // Origin + path only: query strings often carry API keys.
    const { origin, pathname } = new URL(url);
    throw retryableError(`HTTP step: ${method} ${origin}${pathname} returned ${res.status}${snippet ? `: ${snippet}` : ""}`, res.status);
  }
  return { output: { status: res.status, body: parsed } };
}

module.exports = { executeHttpRequest, resolveUrl, buildBody, assertPublicUrl, isPrivateAddress };
