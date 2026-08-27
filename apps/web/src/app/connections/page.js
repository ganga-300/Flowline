"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/api";
import { useAuthProtection } from "@/lib/useAuthProtection";

function ZapIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function PlusIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function LogOutIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

function GoogleIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#EA4335"
        d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
      />
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
      />
      <path
        fill="#FBBC05"
        d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 10.8 0 12.5s.7 2.8 1.9 5.2l3.7-2.9z"
      />
      <path
        fill="#34A853"
        d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
      />
    </svg>
  );
}

export default function ConnectionsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthProtection();

  const [connections, setConnections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    async function loadConnections() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await authFetch("http://localhost:4000/connections");
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || `Failed to fetch connections (${res.status})`);
        }

        setConnections(data.connections || []);
      } catch (err) {
        setError(err.message || "Failed to load connections");
      } finally {
        setIsLoading(false);
      }
    }

    loadConnections();
  }, [isAuthenticated]);

  const handleConnectGmail = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("flowline_token") : null;
    if (!token) {
      alert("Authentication token missing. Please log in first.");
      return;
    }
    // Direct browser top-level navigation required for OAuth 2.0 flow
    window.location.href = `http://localhost:4000/connections/gmail/start?token=${encodeURIComponent(token)}`;
  };

  const handleLogout = () => {
    localStorage.removeItem("flowline_token");
    router.push("/login");
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center font-mono text-xs text-slate-400">
        Redirecting to login...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] font-sans flex flex-col selection:bg-[#c4f542]/30">
      {/* ── Top Header Bar ── */}
      <header className="h-16 border-b border-slate-800/80 bg-[#161b22]/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#c4f542]/10 border border-[#c4f542]/30 flex items-center justify-center text-[#c4f542]">
              <ZapIcon className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">Flowline</span>
          </Link>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            CONNECTIONS
          </span>
        </div>

        {/* Action Buttons Top Right */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-xs font-mono text-slate-400 hover:text-white px-3 py-2 rounded-lg border border-slate-800 hover:border-slate-700 transition-all"
          >
            Dashboard
          </Link>

          <Link
            href="/zaps/new"
            className="bg-[#c4f542] hover:bg-[#b0e030] text-black font-semibold px-4 py-2 rounded-lg transition-all shadow-[0_0_15px_rgba(196,245,66,0.2)] hover:shadow-[0_0_25px_rgba(196,245,66,0.35)] flex items-center gap-2 text-xs font-mono"
          >
            <PlusIcon className="w-4 h-4" />
            <span>New Zap</span>
          </Link>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg transition-all cursor-pointer"
          >
            <LogOutIcon className="w-4 h-4" />
            <span>Log out</span>
          </button>
        </div>
      </header>

      {/* ── Main Content Container ── */}
      <main className="flex-1 max-w-4xl w-full mx-auto py-10 px-4 sm:px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">App Connections</h1>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Manage connected accounts and OAuth credentials for your automation steps
            </p>
          </div>

          <button
            onClick={handleConnectGmail}
            className="bg-white hover:bg-slate-100 text-black font-semibold px-4 py-2.5 rounded-xl transition-all text-xs font-mono flex items-center gap-2 shadow.md cursor-pointer"
          >
            <GoogleIcon className="w-4 h-4" />
            <span>Connect Gmail</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-950/80 border border-red-700 rounded-xl text-xs text-red-200 font-mono">
            <span className="font-bold">Error: </span>
            <span>{error}</span>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-20 bg-[#161b22]/40 rounded-2xl border border-slate-800">
            <div className="inline-block animate-spin w-8 h-8 border-2 border-[#c4f542] border-t-transparent rounded-full mb-3" />
            <p className="text-sm font-mono text-slate-400">Loading your app connections...</p>
          </div>
        ) : connections.length === 0 ? (
          /* Empty State */
          <div className="text-center py-20 px-4 bg-[#161b22]/40 rounded-2xl border border-slate-800/80 shadow-lg">
            <div className="w-14 h-14 rounded-full bg-slate-800/80 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto mb-4">
              <GoogleIcon className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">No Connected Accounts</h3>
            <p className="text-xs font-mono text-slate-400 max-w-sm mx-auto mb-6">
              Connect your Gmail account to start creating automated email workflows.
            </p>
            <button
              onClick={handleConnectGmail}
              className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-black font-semibold px-5 py-2.5 rounded-xl text-xs font-mono shadow-md transition-all cursor-pointer"
            >
              <GoogleIcon className="w-4 h-4" />
              <span>Connect Gmail Account</span>
            </button>
          </div>
        ) : (
          /* Connections List */
          <div className="space-y-4">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="bg-[#161b22] border border-slate-800 hover:border-slate-700 rounded-xl p-5 transition-all shadow-md flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    {conn.provider === "gmail" ? (
                      <GoogleIcon className="w-5 h-5" />
                    ) : (
                      <ZapIcon className="w-5 h-5 text-[#c4f542]" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white capitalize">
                        {conn.provider} Account
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#c4f542]/10 border border-[#c4f542]/30 text-[#c4f542]">
                        Connected
                      </span>
                    </div>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">
                      {conn.email || `ID: ${conn.id}`}
                    </p>
                  </div>
                </div>

                <div className="text-right font-mono text-xs text-slate-500">
                  <span>ID: {conn.id}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
