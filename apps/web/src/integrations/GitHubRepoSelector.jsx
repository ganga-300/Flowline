"use client";

import { useState, useEffect } from "react";
import { authFetch } from "@/lib/api";

export function GitHubRepoSelector({ value, onChange, onSampleDataChange }) {
  const [mode, setMode] = useState("org"); // "org" | "my_repos" | "manual"
  const [ownerInput, setOwnerInput] = useState(() => {
    if (value && value.includes("/")) {
      return value.split("/")[0];
    }
    return "openfoodfacts";
  });
  const [repos, setRepos] = useState([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasConnection, setHasConnection] = useState(true);

  // Fetch repos for a specific owner or organization
  const fetchOrgRepos = async (targetOwner) => {
    const queryOwner = targetOwner || ownerInput;
    if (!queryOwner || !queryOwner.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(
        `http://localhost:4000/connections/github/repos?owner=${encodeURIComponent(queryOwner.trim())}`
      );
      const contentType = res.headers.get("content-type") || "";
      let data = {};
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        throw new Error(`Server returned ${res.status} (${res.statusText || "HTML"}). Please restart your server in apps/server (node src/index.js).`);
      }

      if (!res.ok) {
        throw new Error(data.error || `Failed to fetch repositories (${res.status})`);
      }
      setRepos(data.repos || []);
      if ((data.repos || []).length === 0) {
        setError(`No public repositories found for "${queryOwner}".`);
      }
    } catch (err) {
      setError(err.message);
      setRepos([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch authenticated user's repositories
  const fetchMyRepos = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`http://localhost:4000/connections/github/repos`);
      const contentType = res.headers.get("content-type") || "";
      let data = {};
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        throw new Error(`Server returned ${res.status} (${res.statusText || "HTML"}). Please restart your server in apps/server (node src/index.js).`);
      }

      setHasConnection(data.hasConnection !== false);
      if (data.hasConnection === false) {
        setError(data.message || "Please connect your GitHub account in Connections.");
        setRepos([]);
      } else if (!res.ok) {
        throw new Error(data.error || `Failed to fetch repositories (${res.status})`);
      } else {
        setRepos(data.repos || []);
      }
    } catch (err) {
      setError(err.message);
      setRepos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRepo = (repoName) => {
    onChange(repoName);
    if (onSampleDataChange) {
      onSampleDataChange(repoName);
    }
  };

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="space-y-3 bg-[#0d1117] border border-slate-800 p-4 rounded-xl">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-300">
          GitHub Repository
        </label>
        {value && (
          <span className="text-[11px] font-mono text-[#c4f542] bg-[#c4f542]/10 px-2 py-0.5 rounded">
            Selected: {value}
          </span>
        )}
      </div>

      {/* Mode Selector Tabs */}
      <div className="grid grid-cols-3 gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800 text-[11px]">
        <button
          type="button"
          onClick={() => {
            setMode("org");
            setError(null);
            if (repos.length === 0) fetchOrgRepos(ownerInput);
          }}
          className={`py-1.5 px-2 rounded font-medium transition cursor-pointer ${
            mode === "org"
              ? "bg-slate-800 text-[#c4f542] shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Any User / Org
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("my_repos");
            setError(null);
            fetchMyRepos();
          }}
          className={`py-1.5 px-2 rounded font-medium transition cursor-pointer ${
            mode === "my_repos"
              ? "bg-slate-800 text-[#c4f542] shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          My Repositories
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("manual");
            setError(null);
          }}
          className={`py-1.5 px-2 rounded font-medium transition cursor-pointer ${
            mode === "manual"
              ? "bg-slate-800 text-[#c4f542] shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Direct Input
        </button>
      </div>

      {/* Mode 1: Any User / Org */}
      {mode === "org" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Username or Org (e.g. openfoodfacts)"
              value={ownerInput}
              onChange={(e) => setOwnerInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  fetchOrgRepos();
                }
              }}
              className="flex-1 bg-[#161b22] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-[#c4f542] outline-none"
            />
            <button
              type="button"
              onClick={() => fetchOrgRepos()}
              disabled={loading}
              className="px-3 py-2 bg-[#c4f542] text-black rounded-lg text-xs font-semibold hover:bg-[#b2e336] transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              {loading ? "Fetching..." : "Fetch Repos"}
            </button>
          </div>
        </div>
      )}

      {/* Mode 2: My Repositories */}
      {mode === "my_repos" && !hasConnection && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between text-xs text-amber-200">
          <span>No connected GitHub account found.</span>
          <a
            href="http://localhost:4000/connections/github/start"
            target="_blank"
            rel="noreferrer"
            className="px-2.5 py-1 bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 transition"
          >
            Connect GitHub
          </a>
        </div>
      )}

      {/* Mode 3: Direct Manual Entry */}
      {mode === "manual" && (
        <div>
          <input
            type="text"
            placeholder="owner/repository (e.g. openfoodfacts/openfoodfacts-server)"
            value={value || ""}
            onChange={(e) => handleSelectRepo(e.target.value.trim())}
            className="w-full bg-[#161b22] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-[#c4f542] outline-none font-mono"
          />
        </div>
      )}

      {/* Error display */}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Repos list dropdown (for modes 'org' and 'my_repos') */}
      {mode !== "manual" && repos.length > 0 && (
        <div className="space-y-2 border-t border-slate-800 pt-2">
          <input
            type="text"
            placeholder="Filter repositories..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full bg-[#161b22] border border-slate-700/60 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-[#c4f542] outline-none"
          />

          <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {filteredRepos.map((repo) => {
              const isSelected = value === repo.full_name;
              return (
                <button
                  key={repo.full_name}
                  type="button"
                  onClick={() => handleSelectRepo(repo.full_name)}
                  className={`w-full text-left p-2 rounded-lg text-xs transition flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? "bg-[#c4f542]/15 border border-[#c4f542]/40 text-[#c4f542]"
                      : "bg-slate-900/50 hover:bg-slate-800 text-slate-300"
                  }`}
                >
                  <div className="truncate pr-2">
                    <span className="font-medium">{repo.full_name}</span>
                    {repo.description && (
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">
                        {repo.description}
                      </p>
                    )}
                  </div>
                  {repo.stars > 0 && (
                    <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                      ⭐ {repo.stars}
                    </span>
                  )}
                </button>
              );
            })}
            {filteredRepos.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-2">
                No matching repositories found.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
