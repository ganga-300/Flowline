"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import { Field, Select } from "@/components/ui";

/** Channel picker for the Slack trigger; lists channels of the chosen Slack account. */
export function SlackChannelSelect({ connectionId, value, onChange }) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!connectionId) return;
    let cancelled = false;
    queueMicrotask(() => !cancelled && setLoading(true));
    authFetch(`/connections/${connectionId}/options?type=slack_channels`)
      .then(async (res) => ({ ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) }))
      .then(({ ok, status, data }) => {
        if (cancelled) return;
        setChannels(ok ? data.options || [] : []);
        setLoadError(ok ? null : data.error || `Couldn't load channels (HTTP ${status})`);
      })
      .catch(() => {
        if (cancelled) return;
        setChannels([]);
        setLoadError("Can't reach the Flowline server to load channels.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  if (!connectionId) {
    return (
      <Field label="Channel" hint="Choose a Slack account first.">
        <Select disabled placeholder="Select a channel" value="" onChange={() => {}} />
      </Field>
    );
  }

  return (
    <Field label="Channel" error={loadError} hint="New messages in this channel start the Zap.">
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={loading} placeholder={loading ? "Loading channels…" : "Select a channel"}>
        {channels.map((ch) => (
          <option key={ch.value || ch.id} value={ch.value || ch.id}>{ch.label || ch.name || ch.value}</option>
        ))}
      </Select>
    </Field>
  );
}
