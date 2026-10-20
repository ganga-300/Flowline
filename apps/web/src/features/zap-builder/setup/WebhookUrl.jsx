"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

/** The Zap's webhook URL once it exists (after the first publish). */
export function WebhookUrl({ token }) {
  const [copied, setCopied] = useState(false);

  if (!token) {
    return (
      <div className="rounded-control border border-dashed border-line-strong px-3.5 py-3 text-sm text-ink-muted">
        Publish this Zap to get its webhook URL. It will show here when you edit the Zap.
      </div>
    );
  }

  const url = `${API_BASE_URL}/webhooks/${token}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the URL is still selectable.
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-ink">Webhook URL</p>
      <div className="flex items-center gap-2 rounded-control border border-line bg-subtle py-1.5 pl-3 pr-1.5">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink" title={url}>{url}</code>
        <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-surface px-2 py-1 text-xs font-medium text-ink shadow-card hover:bg-line cursor-pointer">
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-ink-muted">Keep it private: anyone with this URL can start the Zap.</p>
    </div>
  );
}
