/**
 * Alert emails: "a Flow failed" and "an account needs reconnecting", for users with email
 * alerts on (Settings). In-app alerts are always created; these only add an email.
 * Never throws: an email problem must not change how a run or a poll ends.
 */
const prisma = require("./prismaClient");
const { sendEmail, appUrl, flowFailedEmail, reconnectEmail } = require("./email");

// A Flow that keeps failing (e.g. every 5-minute poll) sends at most one email per hour.
const FAILURE_EMAIL_WINDOW_MS = 60 * 60 * 1000;
const APP_NAMES = { github: "GitHub", gmail: "Gmail", slack: "Slack" };

/**
 * After a failure alert was created for this run: email the owner, unless they turned email
 * alerts off or this Flow already alerted within the last hour (the in-app alert still shows).
 */
async function emailFlowFailed({ zap, zapRunId, reason, alertId }, { db = prisma, send = sendEmail, now = Date.now() } = {}) {
  try {
    const user = await db.user.findUnique({ where: { id: zap.userId }, select: { email: true, emailAlerts: true } });
    if (!user?.emailAlerts) return { sent: false, reason: "alerts off" };

    const earlier = await db.alert.count({
      where: { zapId: zap.id, createdAt: { gte: new Date(now - FAILURE_EMAIL_WINDOW_MS) }, ...(alertId && { id: { not: alertId } }) },
    });
    if (earlier > 0) return { sent: false, reason: "already emailed this hour" };

    const base = appUrl();
    const email = flowFailedEmail({
      flowName: zap.zapName,
      reason,
      runUrl: `${base}/flows/${zap.id}/runs?run=${encodeURIComponent(zapRunId)}`,
      settingsUrl: `${base}/settings`,
    });
    return await send({ to: user.email, ...email });
  } catch (err) {
    console.error("[alerts] could not send the failure email:", err.message);
    return { sent: false, reason: err.message };
  }
}

/** When an account first becomes "needs reconnecting": email its owner (if alerts are on). */
async function emailReconnectNeeded(connectionId, { db = prisma, send = sendEmail } = {}) {
  try {
    const connection = await db.connection.findUnique({
      where: { id: connectionId },
      select: { provider: true, user: { select: { email: true, emailAlerts: true } } },
    });
    if (!connection?.user?.emailAlerts) return { sent: false, reason: "alerts off" };

    const [app, ...rest] = connection.provider.split(":");
    const appName = APP_NAMES[app] || app;
    const base = appUrl();
    const email = reconnectEmail({
      appName,
      account: rest.join(":"),
      appsUrl: `${base}/connections?app=${encodeURIComponent(app)}`,
      settingsUrl: `${base}/settings`,
    });
    return await send({ to: connection.user.email, ...email });
  } catch (err) {
    console.error("[alerts] could not send the reconnect email:", err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { emailFlowFailed, emailReconnectNeeded, FAILURE_EMAIL_WINDOW_MS };
