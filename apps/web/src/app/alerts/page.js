"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch, useAuthProtection } from "../../lib/api";

export default function AlertsPage() {
  useAuthProtection();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const res = await authFetch("http://localhost:4000/alerts");
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      setError("Failed to load alerts");
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async (id) => {
    try {
      await authFetch(`http://localhost:4000/alerts/${id}`, { method: "DELETE" });
      setAlerts(alerts.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to dismiss alert", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#161b22]/80 backdrop-blur sticky top-0 z-10 px-8 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#c4f542] flex items-center justify-center text-[#0d1117] font-bold">
              ⚡
            </div>
            <h1 className="text-xl font-bold font-mono tracking-tight">
              Execution Alerts
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-xs font-mono text-slate-400 hover:text-white transition-colors"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Failure Logs & Notifications</h2>
            <p className="text-xs text-slate-400">
              System execution alerts for failed Zap runs requiring attention.
            </p>
          </div>
          <button
            onClick={loadAlerts}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 rounded-lg transition-colors cursor-pointer"
          >
            🔄 Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-500 font-mono text-xs">
            Loading alerts...
          </div>
        ) : error ? (
          <div className="p-4 bg-red-950/50 border border-red-800 rounded-xl text-red-300 text-xs font-mono">
            {error}
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-20 border border-slate-800/80 rounded-2xl bg-slate-900/30 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-green-400 text-xl font-bold">
              ✓
            </div>
            <h3 className="text-sm font-medium text-slate-200">All Systems Operational</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No failed Zap run alerts recorded. All workflows are running smoothly.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-5 bg-[#161b22] border border-red-900/50 hover:border-red-700/80 rounded-xl space-y-3 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-mono font-bold text-red-400 uppercase tracking-wide">
                      Zap Failed: {alert.zap?.zapName || "Untitled Zap"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(alert.createdAt).toLocaleString()}
                    </span>
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                      title="Dismiss Alert"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <p className="text-sm text-slate-200 font-mono bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  {alert.message}
                </p>

                {alert.errorTrace && (
                  <details className="text-xs font-mono text-slate-400 space-y-1">
                    <summary className="cursor-pointer text-red-400/80 hover:text-red-400">
                      View Error Trace Stack
                    </summary>
                    <pre className="mt-2 p-3 bg-[#0d1117] rounded-lg text-[11px] text-red-300/90 overflow-x-auto border border-slate-800 max-h-40">
                      {alert.errorTrace}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
