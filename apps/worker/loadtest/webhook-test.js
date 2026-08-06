import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,        // 10 virtual users, parallel
  duration: '30s', // 30 second tak chalega
};

export default function () {
  const res = http.post(
    'http://localhost:4000/webhooks/test-token-123',
    JSON.stringify({ message: `load test ${Date.now()}-${Math.random()}` }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'status is 202': (r) => r.status === 202,
  });

  sleep(0.1); // thoda gap, real traffic jaisa
}