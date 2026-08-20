"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";

/**
 * Reusable Account Connection Selector Component
 * Renders account selection or connect button for integration actions.
 * 
 * @param {Object} props
 * @param {string} props.providerId - Integration provider ID (e.g. 'gmail')
 * @param {string} [props.providerName] - Human-readable provider name (e.g. 'Gmail')
 * @param {string | null} props.connectionId - Currently selected connection ID
 * @param {Array<{id: string, name?: string, email?: string}>} [props.connections] - Optional pre-loaded accounts list
 * @param {(connectionId: string | null) => void} props.onChange - Connection change handler
 */
export function ConnectionSelector({
  providerId,
  providerName = "App",
  connectionId,
  connections: propConnections = [],
  onChange,
}) {
  const [notice, setNotice] = useState(null);
  const [fetchedConnections, setFetchedConnections] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!providerId) return;

    let isMounted = true;
    async function loadConnections() {
      setIsLoading(true);
      try {
        const res = await authFetch(`http://localhost:4000/connections?provider=${providerId}`);
        if (res.ok && isMounted) {
          const data = await res.json();
          const list = data.connections || [];
          setFetchedConnections(list);
          if (list.length > 0) {
            // Select first connection if current connection is not in list
            const exists = list.some((c) => c.id === connectionId);
            if (!exists) {
              onChange(list[0].id);
            }
          }
        }
      } catch (err) {
        console.error("Error loading connections:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadConnections();
    return () => {
      isMounted = false;
    };
  }, [providerId, connectionId, onChange]);

  const activeConnections = propConnections.length > 0 ? propConnections : fetchedConnections;

  const handleConnectClick = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("flowline_token") : null;
    if (!token) {
      setNotice("Authentication required. Please log in first.");
      return;
    }
    // Navigate to OAuth start endpoint on Flowline server
    window.location.href = `http://localhost:4000/connections/${providerId}/start?token=${encodeURIComponent(token)}`;
  };

  return (
    <div className="space-y-2.5 py-3 border-t border-b border-slate-800/80 my-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-300">
          Account
        </label>
        {connectionId && (
          <span className="text-[10px] font-mono text-[#c4f542] bg-[#c4f542]/10 px-2 py-0.5 rounded border border-[#c4f542]/20">
            Connected
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs font-mono text-slate-500 py-1">Loading connected accounts...</div>
      ) : activeConnections.length > 0 ? (
        <select
          value={connectionId || ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono focus:border-[#c4f542] outline-none"
        >
          <option value="" disabled>
            Select a {providerName} account...
          </option>
          {activeConnections.map((conn) => (
            <option key={conn.id} value={conn.id}>
              {conn.email || conn.name || `${providerName} Account (${conn.id.slice(-6)})`}
            </option>
          ))}
        </select>
      ) : (
        <div className="space-y-2">
          {connectionId ? (
            <div className="flex items-center justify-between p-3 bg-[#0d1117] border border-slate-700 rounded-lg text-xs font-mono text-slate-200">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#c4f542]" />
                <span>{providerName} Account ({connectionId})</span>
              </div>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-slate-400 hover:text-red-400 text-xs transition-colors cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConnectClick}
              className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-slate-600 rounded-lg text-xs font-mono font-medium text-slate-200 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>+ Connect {providerName} Account</span>
            </button>
          )}
        </div>
      )}

      {notice && (
        <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs text-slate-300 font-mono flex items-center justify-between">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-slate-400 hover:text-white text-xs ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
