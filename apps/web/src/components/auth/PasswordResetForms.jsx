"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { Alert, Button, Field, Input } from "@/components/ui";

const unreachable = "Can't reach the Flowline server right now. Please try again in a moment.";

async function post(path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** "Forgot password?": asks for the email and sends a reset link. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await post("/auth/forgot-password", { email });
      setSentTo(email.trim());
    } catch (err) {
      setError(err instanceof TypeError ? unreachable : err.message);
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <MailCheck className="size-6" />
        </span>
        <h1 className="heading-display mt-4 text-3xl text-ink">Check your email</h1>
        <p className="mt-2 text-sm text-ink-muted">
          If an account exists for <span className="font-medium text-ink">{sentTo}</span>, we&apos;ve sent a link to reset its
          password. It expires in 1 hour. Check your spam folder if it doesn&apos;t arrive in a few minutes.
        </p>
        <Button href="/login" variant="secondary" className="mt-6 w-full">Back to log in</Button>
      </div>
    );
  }

  return (
    <>
      <div className="text-center">
        <h1 className="heading-display text-4xl text-ink">Reset your password</h1>
        <p className="mt-2 text-sm text-ink-muted">Enter your account&apos;s email and we&apos;ll send you a link to choose a new password.</p>
      </div>
      <form onSubmit={submit} className="mt-8 space-y-4">
        {error && <Alert tone="danger" onDismiss={() => setError(null)}>{error}</Alert>}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy}>Send reset link</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary hover:text-primary-hover">Log in</Link>
      </p>
    </>
  );
}

/** The page the emailed link opens: choose a new password, then you're signed in. */
export function ResetPasswordForm({ token }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="heading-display text-3xl text-ink">This link is incomplete</h1>
        <p className="mt-2 text-sm text-ink-muted">Open the link from the email again, or request a new one.</p>
        <Button href="/forgot-password" className="mt-6 w-full">Request a new link</Button>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      const data = await post("/auth/reset-password", { token, password });
      localStorage.setItem("flowline_token", data.token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof TypeError ? unreachable : err.message);
      setBusy(false);
    }
  };

  const expired = /expired|already used|incomplete/i.test(error || "");
  return (
    <>
      <div className="text-center">
        <h1 className="heading-display text-4xl text-ink">Choose a new password</h1>
        <p className="mt-2 text-sm text-ink-muted">You&apos;ll be signed in, and signed out everywhere else.</p>
      </div>
      <form onSubmit={submit} className="mt-8 space-y-4">
        {error && (
          <Alert tone="danger" onDismiss={() => setError(null)}>
            {error}{" "}
            {expired && <Link href="/forgot-password" className="font-medium text-primary underline underline-offset-2">Request a new link</Link>}
          </Alert>
        )}
        <Field label="New password" htmlFor="new-password" hint="At least 8 characters.">
          <Input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm-password">
          <Input id="confirm-password" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy}>Set new password</Button>
      </form>
    </>
  );
}
