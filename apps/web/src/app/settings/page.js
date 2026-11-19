"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/api";
import { AppShell, PageHeader } from "@/components/layout";
import { Alert, Button, Card, Field, Input, Modal, Spinner, Switch, Toast } from "@/components/ui";

const unreachable = "Can't reach the Flowline server right now.";
const errorText = (err, fallback) => (err instanceof TypeError ? unreachable : err?.message || fallback);

async function api(path, options) {
  const res = await authFetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function Section({ title, description, children, tone }) {
  return (
    <Card className={tone === "danger" ? "border-danger/30" : undefined}>
      <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,15rem)_1fr] sm:gap-8 sm:p-6">
        <div>
          <h2 className={tone === "danger" ? "text-sm font-semibold text-danger" : "text-sm font-semibold text-ink"}>{title}</h2>
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </Card>
  );
}

/** Account settings: who's signed in, email alerts, password, sessions, deleting the account. */
export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api("/auth/me")
      .then((data) => setUser(data.user))
      .catch((err) => setLoadError(errorText(err, "Couldn't load your account.")));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Email alerts ──
  const [savingAlerts, setSavingAlerts] = useState(false);
  const toggleAlerts = async (emailAlerts) => {
    setSavingAlerts(true);
    try {
      const data = await api("/auth/me", { method: "PATCH", body: JSON.stringify({ emailAlerts }) });
      setUser(data.user);
      setToast(emailAlerts ? "Email alerts are on." : "Email alerts are off.");
    } catch (err) {
      setToast(errorText(err, "Couldn't save that."));
    } finally {
      setSavingAlerts(false);
    }
  };

  // ── Password ──
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState(null);
  const [savingPw, setSavingPw] = useState(false);
  const changePassword = async (e) => {
    e.preventDefault();
    setPwError(null);
    if (pw.next !== pw.confirm) return setPwError("The two new passwords don't match.");
    setSavingPw(true);
    try {
      const data = await api("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) });
      localStorage.setItem("flowline_token", data.token); // this browser stays signed in
      setPw({ current: "", next: "", confirm: "" });
      setToast("Password changed. Other devices have been signed out.");
    } catch (err) {
      setPwError(errorText(err, "Couldn't change your password."));
    } finally {
      setSavingPw(false);
    }
  };

  // ── Sessions ──
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutEverywhere = async () => {
    setLoggingOut(true);
    try {
      await api("/auth/logout-all", { method: "POST" });
      localStorage.removeItem("flowline_token");
      router.push("/login");
    } catch (err) {
      setToast(errorText(err, "Couldn't sign out everywhere."));
      setLoggingOut(false);
    }
  };

  // ── Delete account ──
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteAccount = async () => {
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await api("/auth/account", { method: "DELETE", body: JSON.stringify({ password: deletePassword }) });
      localStorage.removeItem("flowline_token");
      router.push("/");
    } catch (err) {
      setDeleteError(errorText(err, "Couldn't delete your account."));
      setIsDeleting(false);
    }
  };
  const closeDelete = () => {
    setDeleting(false);
    setDeletePassword("");
    setDeleteError(null);
  };

  return (
    <AppShell>
      <PageHeader title="Settings" description="Your account, notifications and security." />

      {loadError && <Alert tone="danger" title="Couldn't load your account" className="mb-6">{loadError}</Alert>}
      {!user && !loadError && (
        <div className="flex items-center gap-2 text-sm text-ink-muted"><Spinner className="size-4" /> Loading your account…</div>
      )}

      {user && (
        <div className="space-y-5">
          <Section title="Account">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-muted">Email</dt>
                <dd className="mt-0.5 break-all font-medium text-ink">{user.email}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Member since</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {new Date(user.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                </dd>
              </div>
            </dl>
          </Section>

          <Section title="Notifications" description="Alerts always appear on the Alerts page. Email makes sure you notice.">
            <div className="flex items-start justify-between gap-4">
              <label htmlFor="email-alerts" className="text-sm">
                <span className="font-medium text-ink">Email me when something needs attention</span>
                <span className="mt-0.5 block text-ink-muted">
                  When a Flow fails (at most one email per Flow per hour), or a connected account needs reconnecting.
                </span>
              </label>
              <Switch id="email-alerts" checked={user.emailAlerts} disabled={savingAlerts} onChange={toggleAlerts} label="Email alerts" />
            </div>
          </Section>

          <Section title="Password" description="Changing it signs you out on every other device.">
            <form onSubmit={changePassword} className="max-w-sm space-y-4">
              {pwError && <Alert tone="danger" onDismiss={() => setPwError(null)}>{pwError}</Alert>}
              <Field label="Current password" htmlFor="current-password">
                <Input id="current-password" type="password" required autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              </Field>
              <Field label="New password" htmlFor="new-password" hint="At least 8 characters.">
                <Input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              </Field>
              <Field label="Confirm new password" htmlFor="confirm-password">
                <Input id="confirm-password" type="password" required minLength={8} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
              </Field>
              <Button type="submit" loading={savingPw}>Change password</Button>
            </form>
          </Section>

          <Section title="Sessions" description="Signed in on a shared or lost device? End every session, including this one.">
            <Button variant="outline" onClick={logoutEverywhere} loading={loggingOut}>Log out everywhere</Button>
          </Section>

          <Section tone="danger" title="Delete account" description="Permanently deletes your Flows, their run history, your connected accounts and alerts.">
            <p className="mb-4 text-sm text-ink-muted">
              This can&apos;t be undone. To also remove Flowline&apos;s access on GitHub, Google or Slack, revoke it in that app&apos;s
              settings (see the <a href="/privacy" className="underline underline-offset-2 hover:text-ink">privacy policy</a>).
            </p>
            <Button variant="danger" onClick={() => setDeleting(true)}>Delete my account</Button>
          </Section>
        </div>
      )}

      <Modal
        open={deleting}
        onClose={closeDelete}
        title="Delete your account?"
        description="Everything is deleted right away: your Flows, run history, connected accounts and alerts. This can't be undone."
        footer={
          <>
            <Button variant="secondary" onClick={closeDelete}>Cancel</Button>
            <Button variant="danger" onClick={deleteAccount} loading={isDeleting} disabled={!deletePassword}>Delete everything</Button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); if (deletePassword) deleteAccount(); }} className="space-y-3">
          {deleteError && <Alert tone="danger">{deleteError}</Alert>}
          <Field label="Enter your password to confirm" htmlFor="delete-password">
            <Input id="delete-password" type="password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
          </Field>
        </form>
      </Modal>

      {toast && <Toast tone="success" onClose={() => setToast(null)}>{toast}</Toast>}
    </AppShell>
  );
}
