"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { Alert, Button, Field, Input } from "@/components/ui";
import { RedirectIfSignedIn } from "@/components/marketing/RedirectIfSignedIn";

const COPY = {
  login: {
    title: "Welcome back",
    subtitle: "Log in to your automations.",
    submit: "Log in",
    submitting: "Logging in...",
    fallbackError: "Failed to log in. Please check your credentials.",
    switchText: "Don't have an account?",
    switchLink: { href: "/signup", label: "Sign up" },
  },
  signup: {
    title: "Create your account",
    subtitle: "Connect GitHub, Slack and Gmail and build your first Zap.",
    submit: "Create account",
    submitting: "Creating account...",
    fallbackError: "Failed to create account. Please try again.",
    switchText: "Already have an account?",
    switchLink: { href: "/login", label: "Log in" },
  },
};

/** Shared login/signup form. mode: "login" | "signup" (also the API path: /auth/<mode>). */
export function AuthForm({ mode }) {
  const copy = COPY[mode];
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `${copy.submit} failed with status ${res.status}`);
      }
      if (!data.token) {
        throw new Error("No authentication token returned by server");
      }
      localStorage.setItem("flowline_token", data.token);
      router.push("/dashboard");
    } catch (err) {
      // fetch() throws a TypeError when the server can't be reached at all.
      setError(err instanceof TypeError ? "Can't reach the Flowline server right now. Please try again in a moment." : err.message || copy.fallbackError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <RedirectIfSignedIn />
      <div className="text-center">
        <h1 className="heading-display text-4xl text-ink">{copy.title}</h1>
        <p className="mt-2 text-sm text-ink-muted">{copy.subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {error && <Alert tone="danger" onDismiss={() => setError(null)}>{error}</Alert>}

        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-faint hover:text-ink cursor-pointer"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? copy.submitting : copy.submit}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        {copy.switchText}{" "}
        <Link href={copy.switchLink.href} className="font-medium text-primary hover:text-primary-hover">
          {copy.switchLink.label}
        </Link>
      </p>
    </>
  );
}
