/**
 * Incoming webhook deliveries (POST /webhooks/:token): what the run's trigger data is, and
 * which deliveries count as the same event. Pure, so it's unit-tested.
 */
const crypto = require("crypto");

// Headers senders use to give each event (or delivery) a unique id. A redelivery of the same
// event repeats it; two separate events with identical bodies don't share it.
const DELIVERY_ID_HEADERS = [
  "idempotency-key",
  "x-idempotency-key",
  "x-github-delivery",
  "x-request-id",
  "x-delivery-id",
  "x-event-id",
  "x-webhook-id",
  "webhook-id", // Standard Webhooks (Svix, Clerk, ...)
  "x-shopify-webhook-id",
  "x-zendesk-webhook-id",
];

// Without an id, an identical body within this window is treated as a retry of the same
// delivery. Two genuinely separate identical events within it run once: the trade-off for not
// running a sender's quick retries twice.
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

/** The delivery id header's value, if the sender sent one. */
function deliveryId(headers = {}) {
  for (const name of DELIVERY_ID_HEADERS) {
    const value = headers[name];
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string" && first.trim()) return first.trim().slice(0, 500);
  }
  return null;
}

/**
 * The run's trigger data: a JSON body as sent, a form post as its fields, plain text as
 * { text }, and an empty body as {}. (Express leaves req.body undefined without a body.)
 */
function webhookPayload(body) {
  if (body === undefined || body === null) return {};
  if (typeof body === "string") return body.trim() ? { text: body } : {};
  if (Buffer.isBuffer(body)) return body.length ? { text: body.toString("utf8") } : {};
  return body;
}

/** The run's idempotency key: per delivery id when there is one, else per body per window. */
function webhookIdempotencyKey(triggerId, { headers, payload, now = Date.now() }) {
  const id = deliveryId(headers);
  if (id) return `${triggerId}-delivery-${sha256(id)}`;
  const window = Math.floor(now / DEDUPE_WINDOW_MS);
  return `${triggerId}-${sha256(JSON.stringify(payload))}-w${window}`;
}

module.exports = { DELIVERY_ID_HEADERS, DEDUPE_WINDOW_MS, deliveryId, webhookPayload, webhookIdempotencyKey };
