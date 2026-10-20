"use client";

import { useState, useEffect } from "react";
import { Search, Star } from "lucide-react";
import { authFetch } from "@/lib/api";
import { startOAuth } from "@/lib/oauth";
import { Button, Input, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";

const MODES = [
  { id: "my_repos", label: "My repos" },
  { id: "org", label: "Any owner" },
  { id: "manual", label: "Type it" },
];

export function GitHubRepoSelector({ connectionId, value, onChange, onSampleDataChange }) {
  // Repos are listed with the GitHub account chosen in the trigger, not just the newest connection.
  const connParam = connectionId ? `connectionId=${encodeURIComponent(connectionId)}` : "";
  const [mode, setMode] = useState("my_repos"); // "org" | "my_repos" | "manual"
  const [ownerInput, setOwnerInput] = useState(() => {
    if (value && value.includes("/")) {
      return value.split("/")[0];
    }
    return "";
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
        `/connections/github/repos?owner=${encodeURIComponent(queryOwner.trim())}${connParam ? `&${connParam}` : ""}`
      );
      const contentType = res.headers.get("content-type") || "";
      let data = {};
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        throw new Error(`The Flowline server returned an unexpected response (${res.status}). Is it running?`);
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
      const res = await authFetch(`/connections/github/repos${connParam ? `?${connParam}` : ""}`);
      const contentType = res.headers.get("content-type") || "";
      let data = {};
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        throw new Error(`The Flowline server returned an unexpected response (${res.status}). Is it running?`);
      }

      setHasConnection(data.hasConnection !== false);
      if (data.hasConnection === false) {
        setError(data.message || "Connect a GitHub account first.");
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

  // Load "My Repos" for the selected account whenever the account changes.
  useEffect(() => {
    if (!connectionId || mode !== "my_repos") return;
    queueMicrotask(() => fetchMyRepos());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  const handleSelectRepo = (repoName) => {
    onChange(repoName);
    if (onSampleDataChange) {
      onSampleDataChange(repoName);
    }
  };

  const filteredRepos = repos.filter((r) => r.full_name.toLowerCase().includes(searchFilter.toLowerCase()));

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    if (next === "my_repos") fetchMyRepos();
    if (next === "org" && repos.length === 0) fetchOrgRepos(ownerInput);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">Repository</p>
        {value && <span className="truncate font-mono text-xs text-ink-muted">{value}</span>}
      </div>

      <Tabs items={MODES} value={mode} onChange={switchMode} className="w-full [&>button]:flex-1 [&>button]:justify-center" />

      {mode === "org" && (
        <div className="flex gap-2">
          <Input
            placeholder="GitHub user or org, e.g. vercel"
            value={ownerInput}
            onChange={(e) => setOwnerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                fetchOrgRepos();
              }
            }}
          />
          <Button variant="outline" onClick={() => fetchOrgRepos()} loading={loading}>Find</Button>
        </div>
      )}

      {mode === "my_repos" && !hasConnection && (
        <div className="flex items-center justify-between gap-3 rounded-control border border-dashed border-line-strong p-3 text-sm text-ink-muted">
          <span>No GitHub account connected.</span>
          <Button size="sm" variant="outline" onClick={() => startOAuth("github")}>Connect GitHub</Button>
        </div>
      )}

      {mode === "manual" && (
        <Input
          placeholder="owner/repository, e.g. vercel/next.js"
          value={value || ""}
          onChange={(e) => handleSelectRepo(e.target.value.trim())}
          className="font-mono text-[13px]"
        />
      )}

      {error && !(mode === "my_repos" && !hasConnection) && <p className="text-xs text-danger">{error}</p>}
      {mode === "my_repos" && loading && repos.length === 0 && <p className="text-sm text-ink-muted">Loading repositories…</p>}

      {mode !== "manual" && repos.length > 0 && (
        <div className="overflow-hidden rounded-control border border-line">
          <div className="relative border-b border-line">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              placeholder={`Filter ${repos.length} repositories`}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="h-9 w-full bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filteredRepos.map((repo) => {
              const selected = value === repo.full_name;
              return (
                <button
                  key={repo.full_name}
                  type="button"
                  onClick={() => handleSelectRepo(repo.full_name)}
                  aria-pressed={selected}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-control px-2.5 py-2 text-left cursor-pointer",
                    selected ? "bg-primary-soft" : "hover:bg-subtle"
                  )}
                >
                  <span className="min-w-0">
                    <span className={cn("block truncate text-sm font-medium", selected ? "text-primary" : "text-ink")}>{repo.full_name}</span>
                    {repo.description && <span className="block truncate text-xs text-ink-muted">{repo.description}</span>}
                  </span>
                  {repo.stars > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-faint"><Star className="size-3" />{repo.stars}</span>
                  )}
                </button>
              );
            })}
            {filteredRepos.length === 0 && <p className="px-2.5 py-3 text-center text-sm text-ink-muted">No matching repositories.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
