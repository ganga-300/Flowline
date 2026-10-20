"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { authFetch } from "@/lib/api";
import { startOAuth } from "@/lib/oauth";
import { Alert, Button, Field, Select } from "@/components/ui";

/**
 * Account picker for one app. Lists the user's connections for providerId, selects the
 * first one when nothing valid is selected, and offers "Connect" (OAuth; the builder
 * draft survives the redirect, see lib/builderDraft.js).
 */
export function ConnectionSelector({ providerId, providerName = "App", connectionId, connections: propConnections = [], onChange }) {
  const [notice, setNotice] = useState(null);
  const [fetchedConnections, setFetchedConnections] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Callers pass inline functions; keep the latest without re-fetching on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!providerId) return;
    let isMounted = true;
    queueMicrotask(() => isMounted && setIsLoading(true));
    authFetch(`/connections?provider=${providerId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!isMounted) return;
        if (!res.ok) throw new Error(data.error || `Couldn't load accounts (HTTP ${res.status})`);
        const list = data.connections || [];
        setFetchedConnections(list);
        setLoadError(null);
        if (list.length > 0 && !list.some((c) => c.id === connectionId)) onChangeRef.current(list[0].id);
      })
      .catch((err) => isMounted && setLoadError(err instanceof TypeError ? "Can't reach the Flowline server." : err.message))
      .finally(() => isMounted && setIsLoading(false));
    return () => {
      isMounted = false;
    };
  }, [providerId, connectionId]);

  const accounts = propConnections.length > 0 ? propConnections : fetchedConnections;

  const connect = () => {
    if (!startOAuth(providerId)) setNotice("Please log in again first.");
  };

  return (
    <div className="space-y-2">
      {isLoading && accounts.length === 0 ? (
        <Field label={`${providerName} account`}>
          <Select disabled value="" placeholder="Loading accounts…" onChange={() => {}} />
        </Field>
      ) : accounts.length > 0 ? (
        <Field label={`${providerName} account`}>
          <Select value={connectionId || ""} onChange={(e) => onChange(e.target.value || null)}>
            <option value="" disabled>Select an account</option>
            {accounts.map((conn) => (
              <option key={conn.id} value={conn.id}>
                {conn.email || conn.name || `${providerName} account (${conn.id.slice(-6)})`}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <div className="space-y-2 rounded-control border border-dashed border-line-strong p-3.5">
          <p className="text-sm text-ink-muted">No {providerName} account connected yet.</p>
          <Button variant="outline" size="sm" onClick={connect} leftIcon={<Plus className="size-3.5" />}>Connect {providerName}</Button>
        </div>
      )}

      {!isLoading && accounts.length > 0 && (
        <div>
          <button type="button" onClick={connect} className="text-xs font-medium text-primary hover:underline cursor-pointer">
            + Connect another {providerName} account
          </button>
          {providerId === "slack" && (
            <p className="mt-0.5 text-xs text-ink-muted">On Slack&apos;s page, use the workspace menu (top right) to pick the workspace that has your channel.</p>
          )}
        </div>
      )}

      {loadError && <p className="text-xs text-danger">{loadError}</p>}
      {notice && <Alert tone="warning" onDismiss={() => setNotice(null)}>{notice}</Alert>}
    </div>
  );
}
