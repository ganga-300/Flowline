"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function ZapIcon({ className = "w-6 h-6" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("http://localhost:4000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Login failed with status ${res.status}`);
      }

      if (data.token) {
        localStorage.setItem("flowline_token", data.token);
        router.push("/dashboard");
      } else {
        throw new Error("No authentication token returned by server");
      }
    } catch (err) {
      setError(err.message || "Failed to log in. Please check your credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] font-sans flex items-center justify-center p-4 selection:bg-[#c4f542]/30">
      <div className="w-full max-w-md bg-[#161b22] border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[#c4f542]/10 border border-[#c4f542]/30 flex items-center justify-center text-[#c4f542]">
              <ZapIcon className="w-6 h-6" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">Flowline</span>
          </Link>
          <h1 className="text-2xl font-bold text-white tracking-tight">Welcome Back</h1>
          <p className="text-xs font-mono text-slate-400">
            Log in to manage and execute your automation Zaps
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 bg-red-950/80 border border-red-700/80 rounded-xl text-xs text-red-200 font-mono animate-fadeIn">
            <span className="font-bold">Error: </span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5 uppercase tracking-wider">
              Email Address
            </label>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white font-mono placeholder:text-slate-600 focus:border-[#c4f542] focus:ring-1 focus:ring-[#c4f542] outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0d1117] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white font-mono placeholder:text-slate-600 focus:border-[#c4f542] focus:ring-1 focus:ring-[#c4f542] outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 bg-[#c4f542] hover:bg-[#b0e030] text-black font-semibold py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(196,245,66,0.2)] hover:shadow-[0_0_30px_rgba(196,245,66,0.35)] text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin w-4 h-4 text-black" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Logging in...</span>
              </>
            ) : (
              <span>Log in</span>
            )}
          </button>
        </form>

        {/* Footer link */}
        <div className="text-center pt-2 border-t border-slate-800/80">
          <p className="text-xs text-slate-400">
            Don't have an account?{" "}
            <Link href="/signup" className="text-[#c4f542] hover:underline font-mono font-semibold">
              Sign up
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
