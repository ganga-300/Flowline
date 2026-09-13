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

function SlackIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/>
      <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/>
      <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"/>
      <path fill="#ECB22E" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
    </svg>
  );
}

function GitHubIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
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

  const handleOAuthConnect = (provider) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("flowline_token") : null;
    if (!token) {
      alert("Authentication token missing. Please log in first.");
      return;
    }
    window.location.href = `http://localhost:4000/connections/${provider}/start?token=${encodeURIComponent(token)}`;
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

  const getProviderIcon = (provider) => {
    switch (provider) {
      case "gmail":
        return <GoogleIcon className="w-5 h-5" />;
      case "slack":
        return <SlackIcon className="w-5 h-5" />;
      case "github":
        return <GitHubIcon className="w-5 h-5 text-white" />;
      default:
        return <ZapIcon className="w-5 h-5 text-[#c4f542]" />;
    }
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">App Connections</h1>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Connect your favorite apps with 1-click authorization
            </p>
          </div>

          {/* Connect App Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleOAuthConnect("gmail")}
              className="bg-white hover:bg-slate-100 text-black font-semibold px-3.5 py-2 rounded-xl transition-all text-xs font-mono flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <GoogleIcon className="w-4 h-4" />
              <span>Connect Gmail</span>
            </button>

            <button
              onClick={() => handleOAuthConnect("slack")}
              className="bg-[#4A154B] hover:bg-[#611f64] text-white font-semibold px-3.5 py-2 rounded-xl transition-all text-xs font-mono flex items-center gap-2 shadow-sm cursor-pointer border border-[#611f64]"
            >
              <SlackIcon className="w-4 h-4" />
              <span>Connect Slack</span>
            </button>

            <button
              onClick={() => handleOAuthConnect("github")}
              className="bg-[#24292e] hover:bg-[#2f363d] text-white font-semibold px-3.5 py-2 rounded-xl transition-all text-xs font-mono flex items-center gap-2 shadow-sm cursor-pointer border border-slate-700"
            >
              <GitHubIcon className="w-4 h-4 text-white" />
              <span>Connect GitHub</span>
            </button>
          </div>
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
              <ZapIcon className="w-7 h-7 text-[#c4f542]" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">No Connected Accounts Yet</h3>
            <p className="text-xs font-mono text-slate-400 max-w-sm mx-auto mb-6">
              Connect your Gmail, Slack, or GitHub account to start creating automated workflows.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                onClick={() => handleOAuthConnect("gmail")}
                className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-black font-semibold px-4 py-2 rounded-xl text-xs font-mono shadow-md transition-all cursor-pointer"
              >
                <GoogleIcon className="w-4 h-4" />
                <span>Connect Gmail</span>
              </button>
              <button
                onClick={() => handleOAuthConnect("slack")}
                className="inline-flex items-center gap-2 bg-[#4A154B] hover:bg-[#611f64] text-white font-semibold px-4 py-2 rounded-xl text-xs font-mono shadow-md transition-all cursor-pointer"
              >
                <SlackIcon className="w-4 h-4" />
                <span>Connect Slack</span>
              </button>
              <button
                onClick={() => handleOAuthConnect("github")}
                className="inline-flex items-center gap-2 bg-[#24292e] hover:bg-[#2f363d] text-white font-semibold px-4 py-2 rounded-xl text-xs font-mono shadow-md transition-all cursor-pointer border border-slate-700"
              >
                <GitHubIcon className="w-4 h-4 text-white" />
                <span>Connect GitHub</span>
              </button>
            </div>
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
                    {getProviderIcon(conn.provider)}
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
