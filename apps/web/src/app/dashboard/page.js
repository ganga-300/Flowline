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

function HistoryIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthProtection();

  const [zaps, setZaps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    async function loadZaps() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await authFetch("http://localhost:4000/zaps");
        const text = await res.text();
        let data = {};
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("Server returned an invalid response");
        }

        if (!res.ok) {
          throw new Error(data.error || `Failed to fetch zaps (${res.status})`);
        }

        setZaps(data.zaps || []);
      } catch (err) {
        setError(err.message || "Failed to load Zaps");
      } finally {
        setIsLoading(false);
      }
    }

    loadZaps();
  }, [isAuthenticated]);

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
          <div className="w-8 h-8 rounded-lg bg-[#c4f542]/10 border border-[#c4f542]/30 flex items-center justify-center text-[#c4f542]">
            <ZapIcon className="w-5 h-5" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">Flowline</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            DASHBOARD
          </span>
        </div>

        {/* Action Buttons Top Right */}
        <div className="flex items-center gap-3">
          <Link
            href="/zaps/new"
            className="bg-[#c4f542] hover:bg-[#b0e030] text-black font-semibold px-4 py-2 rounded-lg transition-all shadow-[0_0_15px_rgba(196,245,66,0.2)] hover:shadow-[0_0_25px_rgba(196,245,66,0.35)] flex items-center gap-2 text-xs font-mono"
          >
            <PlusIcon className="w-4 h-4" />
            <span>New Zap</span>
          </Link>

          {/* Log out Button */}
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
      <main className="flex-1 max-w-5xl w-full mx-auto py-10 px-4 sm:px-6">
        
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Your Automation Zaps</h1>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Manage existing workflows or build new triggers and actions
            </p>
          </div>
          <Link
            href="/zaps/new"
            className="bg-[#161b22] hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-[#c4f542]/50 px-4 py-2.5 rounded-xl transition-all text-xs font-mono flex items-center gap-2"
          >
            <PlusIcon className="w-4 h-4 text-[#c4f542]" />
            <span>Create New Zap</span>
          </Link>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-950/80 border border-red-700 rounded-xl text-xs text-red-200 font-mono">
            <span className="font-bold">Error loading Zaps: </span>
            <span>{error}</span>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-20 bg-[#161b22]/40 rounded-2xl border border-slate-800">
            <div className="inline-block animate-spin w-8 h-8 border-2 border-[#c4f542] border-t-transparent rounded-full mb-3" />
            <p className="text-sm font-mono text-slate-400">Loading your Zaps...</p>
          </div>
        ) : zaps.length === 0 ? (
          /* Empty State */
          <div className="text-center py-20 px-4 bg-[#161b22]/40 rounded-2xl border border-slate-800/80 shadow-lg">
            <div className="w-14 h-14 rounded-full bg-slate-800/80 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto mb-4">
              <ZapIcon className="w-7 h-7 text-[#c4f542]" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">No Zaps created yet</h3>
            <p className="text-xs font-mono text-slate-400 max-w-sm mx-auto mb-6">
              Get started by creating your first automated Zap workflow.
            </p>
            <Link
              href="/zaps/new"
              className="inline-flex items-center gap-2 bg-[#c4f542] hover:bg-[#b0e030] text-black font-semibold px-5 py-2.5 rounded-xl text-xs font-mono shadow-[0_0_20px_rgba(196,245,66,0.2)] transition-all"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Create Your First Zap</span>
            </Link>
          </div>
        ) : (
          /* Zaps Grid / List */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {zaps.map((zap) => (
              <div
                key={zap.id}
                className="bg-[#161b22] border border-slate-800 hover:border-[#c4f542]/50 rounded-2xl p-6 transition-all shadow-lg flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-[#c4f542]/10 border border-[#c4f542]/30 flex items-center justify-center text-[#c4f542]">
                        <ZapIcon className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-mono text-slate-400">
                        {zap.trigger?.type || "ZAP"}
                      </span>
                    </div>

                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#c4f542]/10 border border-[#c4f542]/30 text-[#c4f542]">
                      {zap.status || "ENABLED"}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-white mb-1 group-hover:text-[#c4f542] transition-colors">
                    {zap.zapName || zap.name || "Untitled Zap"}
                  </h3>
                  <p className="text-xs font-mono text-slate-400 mb-4 line-clamp-2">
                    ID: {zap.id} • {zap.steps?.length || 0} step(s)
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
                  <Link
                    href={`/zaps/${zap.id}/runs`}
                    className="text-xs font-mono text-[#c4f542] hover:underline flex items-center gap-1.5"
                  >
                    <HistoryIcon className="w-3.5 h-3.5" />
                    <span>Run History</span>
                  </Link>

                  <Link
                    href={`/zaps/new`}
                    className="text-xs font-mono text-slate-400 hover:text-white"
                  >
                    Edit Zap →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

      </main>
    </div>
  );
}
