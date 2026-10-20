// k6: webhook ingestion capacity at a fixed arrival rate.
// Run once per level, e.g.:  k6 run -e RATE=500 -e WEBHOOK_TOKEN=... loadtest/ramp-webhooks.js
// A level "holds" if errors < 1%, p95 < 500 ms and k6 could start (almost) every request.
import http from "k6/http";
import { check } from "k6";

const RATE = Number(__ENV.RATE || 100);
const API = __ENV.API_URL || "http://localhost:4000";

export const options = {
  discardResponseBodies: true,
  scenarios: {
    ingest: {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: __ENV.DURATION || "15s",
      preAllocatedVUs: Math.min(RATE, 400),
      maxVUs: 1000,
    },
  },
  summaryTrendStats: ["avg", "p(50)", "p(95)", "p(99)", "max"],
};

export default function () {
  // Unique body per request so idempotency doesn't collapse requests into one run.
  const res = http.post(`${API}/webhooks/${__ENV.WEBHOOK_TOKEN}`,
    JSON.stringify({ seq: `${__VU}-${__ITER}-${Date.now()}`, runTag: "ramp" }),
    { headers: { "Content-Type": "application/json" } });
  check(res, { "202 accepted": (r) => r.status === 202 });
}
