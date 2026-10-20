/**
 * TEST ONLY - creates a user, a fake GitHub connection and a Zap
 * (Webhook -> GitHub Create Issue "bench <seq>" -> GitHub Add Comment on that issue)
 * for load/crash tests. Two steps, so a crash during step 2 shows whether step 1 is re-sent.
 * Needs the server running (API_URL) and DATABASE_URL for the connection row.
 * Usage: node loadtest/setup-bench-zap.js > bench.json
 */
const prisma = require("../src/prismaClient");
const API = process.env.API_URL || "http://localhost:4000";

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

(async () => {
  const email = `bench-${Date.now()}@example.com`;
  const { token, user } = await api("/auth/signup", { method: "POST", body: { email, password: "bench-password-1" } });
  // A connection row without real OAuth: the fake providers accept any token.
  const conn = await prisma.connection.create({ data: { provider: "github:bench", accessToken: "fake-token", userId: user.id } });
  const { zap } = await api("/zaps", {
    method: "POST",
    token,
    body: {
      name: "Bench: webhook -> GitHub issue",
      trigger: { type: "WEBHOOK", config: { provider: "webhook", event: "catch_hook" } },
      steps: [{
        type: "ACTION", name: "Create issue", order: 0, connectionId: conn.id,
        config: { provider: "github", action: "create_issue", connectionId: conn.id, ref: "step-1",
          config: { repo: "fake/repo", title: "bench {{trigger.seq}}", body: "run {{trigger.runTag}}" } },
      }, {
        type: "ACTION", name: "Comment", order: 1, connectionId: conn.id,
        config: { provider: "github", action: "add_comment", connectionId: conn.id, ref: "step-2",
          config: { repo: "fake/repo", issueNumber: "{{steps.step-1.output.issueNumber}}", body: "comment {{trigger.seq}} run {{trigger.runTag}}" } },
      }],
    },
  });
  console.log(JSON.stringify({ token, userId: user.id, zapId: zap.id, webhookToken: zap.trigger.webhookToken }));
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
