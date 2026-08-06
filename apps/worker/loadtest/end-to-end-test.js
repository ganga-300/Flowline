import http from 'k6/http';
import { sleep } from 'k6';
import { Trend } from 'k6/metrics';

const endToEndDuration = new Trend('end_to_end_duration_ms');

export const options = {
  vus: 3,
  iterations: 15,
};

export default function () {
  const start = Date.now();

  const triggerRes = http.post(
    'http://localhost:4000/webhooks/test-token-123',
    JSON.stringify({ message: `e2e test ${Date.now()}-${Math.random()}`, priority: 'normal' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  console.log(`trigger response: ${triggerRes.status} ${triggerRes.body}`); // NAYI LINE

  const runId = JSON.parse(triggerRes.body).runId;

  let status = 'QUEUED';
  while (status !== 'SUCCESS' && status !== 'FAILED' && status !== 'FILTERED') {
    sleep(1);
    const historyRes = http.get(`http://localhost:4000/zaps/1/runs/${runId}`);
    status = JSON.parse(historyRes.body).run.status;
  }

  const elapsed = Date.now() - start;
  endToEndDuration.add(elapsed);
}