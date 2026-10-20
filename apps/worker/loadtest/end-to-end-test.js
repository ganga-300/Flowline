// k6: end-to-end latency - webhook received -> run finished (all steps done), measured by
// polling the run-history API as the logged-in owner.
//   k6 run -e API_URL=http://localhost:4000 -e WEBHOOK_TOKEN=... -e ZAP_ID=... -e TOKEN=<JWT> loadtest/end-to-end-test.js
// (setup-bench-zap.js prints webhookToken, zapId and token for a test Zap.)
import http from 'k6/http';
import { sleep, check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const endToEndDuration = new Trend('end_to_end_duration_ms', true);
const completed = new Rate('runs_succeeded');

const API = __ENV.API_URL || 'http://localhost:4000';
const auth = { headers: { Authorization: `Bearer ${__ENV.TOKEN}` } };

export const options = {
  vus: Number(__ENV.VUS || 3),
  duration: __ENV.DURATION || '30s',
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  const start = Date.now();
  const triggerRes = http.post(
    `${API}/webhooks/${__ENV.WEBHOOK_TOKEN}`,
    JSON.stringify({ seq: `e2e-${__VU}-${__ITER}-${Date.now()}`, runTag: 'e2e' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  if (!check(triggerRes, { 'webhook accepted': (r) => r.status === 202 })) return;
  const runId = JSON.parse(triggerRes.body).runId;

  let status = 'QUEUED';
  const deadline = start + 60000;
  while (!['SUCCESS', 'FAILED', 'FILTERED'].includes(status) && Date.now() < deadline) {
    sleep(0.05);
    const historyRes = http.get(`${API}/zaps/${__ENV.ZAP_ID}/runs/${runId}`, auth);
    if (historyRes.status === 200) status = JSON.parse(historyRes.body).run.status;
  }

  completed.add(status === 'SUCCESS');
  if (status === 'SUCCESS') endToEndDuration.add(Date.now() - start);
}
