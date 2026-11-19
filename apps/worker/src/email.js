/**
 * Sends the few emails Flowline needs: password reset, "a Flow failed", "reconnect an account".
 * Used by the API (password reset) and the worker (alerts).
 *
 * With RESEND_API_KEY set, mail goes through Resend's HTTP API (no SDK). Without it (local
 * development) the email is printed to the log instead, so the flows still work end to end;
 * in production a missing key logs a warning once and emails are skipped.
 * EMAIL_FROM is the sender, e.g. "Flowline <alerts@your-domain.com>" (a domain verified in
 * Resend). Resend's test sender only delivers to the Resend account's own address.
 */
const { fetchWithTimeout } = require("./fetchWithTimeout");

const DEFAULT_FROM = "Flowline <onboarding@resend.dev>";
let warnedNoKey = false;

/** The web app's address, for links in emails (first FRONTEND_URL entry). */
function appUrl(env = process.env) {
  const first = (env.FRONTEND_URL || "").split(",")[0].trim().replace(/\/+$/, "");
  return first || "http://localhost:3000";
}

/**
 * Sends one email. Never throws: an email that can't be sent must not fail a run or a
 * request. Returns { sent: boolean, logged?: boolean, error?: string }.
 */
async function sendEmail({ to, subject, text, html }, { env = process.env, fetch = fetchWithTimeout, log = console } = {}) {
  if (!to || !subject) return { sent: false, error: "missing recipient or subject" };

  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === "production") {
      if (!warnedNoKey) log.warn("[email] RESEND_API_KEY is not set: emails (password reset, alerts) are not sent.");
      warnedNoKey = true;
      return { sent: false, error: "email is not configured" };
    }
    log.log(`[email] (not sent: no RESEND_API_KEY) To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return { sent: false, logged: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM || DEFAULT_FROM, to: [to], subject, text, html }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const error = body.message || `HTTP ${res.status}`;
      log.error(`[email] Resend refused the email "${subject}": ${error}`);
      return { sent: false, error };
    }
    return { sent: true };
  } catch (err) {
    log.error(`[email] Could not send "${subject}": ${err.message}`);
    return { sent: false, error: err.message };
  }
}

// ── Templates: plain text plus simple inline-styled HTML (email clients ignore <style>). ──

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function layout({ heading, paragraphs, button, footer }) {
  const p = (t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3a3d44">${escapeHtml(t)}</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #e6e6e3;border-radius:12px"><tr><td style="padding:28px">
<p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#16181d">Flowline</p>
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#16181d">${escapeHtml(heading)}</h1>
${paragraphs.map(p).join("\n")}
${button ? `<p style="margin:22px 0"><a href="${escapeHtml(button.href)}" style="display:inline-block;background:#3d5cf5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">${escapeHtml(button.label)}</a></p>` : ""}
${footer ? `<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#6b6f77">${escapeHtml(footer)}</p>` : ""}
</td></tr></table></td></tr></table></body></html>`;
  const text = [heading, "", ...paragraphs.flatMap((t) => [t, ""]), button ? `${button.label}: ${button.href}` : "", footer ? `\n${footer}` : ""]
    .join("\n")
    .trim();
  return { html, text };
}

const ALERTS_FOOTER = "You get these emails because email alerts are on. Turn them off in Settings.";

function passwordResetEmail({ resetUrl }) {
  return {
    subject: "Reset your Flowline password",
    ...layout({
      heading: "Reset your password",
      paragraphs: [
        "Someone (hopefully you) asked to reset the password for this Flowline account.",
        "The link works once and expires in 1 hour. If you didn't ask for it, ignore this email; your password stays the same.",
      ],
      button: { label: "Choose a new password", href: resetUrl },
    }),
  };
}

function flowFailedEmail({ flowName, reason, runUrl, settingsUrl }) {
  return {
    subject: `Your Flow "${flowName}" failed`,
    ...layout({
      heading: `"${flowName}" failed`,
      paragraphs: [reason, "Run history shows what each step sent and received. You can retry the run from there."],
      button: { label: "View the run", href: runUrl },
      footer: `${ALERTS_FOOTER} ${settingsUrl}`,
    }),
  };
}

function reconnectEmail({ appName, account, appsUrl, settingsUrl }) {
  const who = account ? `${appName} account (${account})` : `${appName} account`;
  return {
    subject: `Reconnect your ${appName} account in Flowline`,
    ...layout({
      heading: `Your ${who} needs to be reconnected`,
      paragraphs: [
        `${appName} stopped accepting Flowline's access (for example the access was revoked, or the password changed).`,
        "Flows that use this account can't run until you reconnect it. Reconnecting takes a few seconds and keeps your Flows as they are.",
      ],
      button: { label: `Reconnect ${appName}`, href: appsUrl },
      footer: `${ALERTS_FOOTER} ${settingsUrl}`,
    }),
  };
}

module.exports = { sendEmail, appUrl, passwordResetEmail, flowFailedEmail, reconnectEmail, escapeHtml };
