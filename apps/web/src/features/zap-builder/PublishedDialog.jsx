"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { authFetch } from "@/lib/api";
import { flattenSample } from "@/integrations/triggerVariables";
import { WebhookUrl } from "./setup/WebhookUrl";
import { ValueTable } from "./test/ValueTable";

const POLLING_TEXT = {
  github: (c) => `Flowline checks ${c.repo || "the repository"} about every 5 minutes. Each new ${c.event === "new_push" ? "commit" : "issue"} from now on starts a run.`,
  gmail: () => "Flowline checks your inbox about every 5 minutes. Each new matching email from now on starts a run.",
  slack: () => "Flowline checks the channel about every 5 minutes. Each new message from now on starts a run.",
};

/**
 * Shown right after a new Zap is published: it's on, and what starts it. A webhook Zap shows
 * its URL and waits for the first request, then shows the fields that request carried.
 */
export function PublishedDialog({ zap, onDone }) {
  const trigger = zap?.trigger || {};
  const config = trigger.config || {};
  const isWebhook = trigger.type === "WEBHOOK";
  const [received, setReceived] = useState(null); // the first request's body

  // Webhook: check for the first request every few seconds while the dialog is open.
  useEffect(() => {
    if (!isWebhook || !trigger.id || received) return;
    let stopped = false;
    const check = async () => {
      try {
        const res = await authFetch(`/zaps/test-step/sample/${trigger.id}`);
        const data = await res.json().catch(() => ({}));
        if (!stopped && res.ok && data.sample) setReceived(data.sample);
      } catch {
        // Keep waiting; a network blip shouldn't show an error here.
      }
    };
    const timer = setInterval(check, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [isWebhook, trigger.id, received]);

  if (!zap) return null;
  const fields = received ? flattenSample(received).map(({ path, value }) => ({ key: `trigger.${path}`, value })) : [];

  return (
    <Modal
      open
      onClose={onDone}
      title={`"${zap.zapName}" is on`}
      description={isWebhook ? "It runs every time this URL receives a POST request." : POLLING_TEXT[config.provider]?.(config) || "It runs automatically from now on."}
      className="max-w-lg"
      footer={
        <>
          <Button variant="secondary" href={`/history?zap=${zap.id}`}>View runs</Button>
          <Button onClick={onDone}>Done</Button>
        </>
      }
    >
      {isWebhook ? (
        <div className="space-y-4">
          <WebhookUrl token={trigger.webhookToken} />
          {received ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                <CheckCircle2 className="size-4" /> Request received. It started a run.
              </p>
              <p className="text-sm text-ink-muted">
                These fields can now be inserted into later steps. Edit the Zap to use them.
              </p>
              <ValueTable rows={fields.slice(0, 8)} />
            </div>
          ) : (
            <div className="space-y-2 rounded-control bg-subtle px-3.5 py-3 text-sm text-ink-muted">
              <p className="flex items-center gap-2 font-medium text-ink">
                <Loader2 className="size-4 animate-spin text-primary" /> Waiting for the first request…
              </p>
              <p>Send a test request with a JSON body, for example:</p>
              <code className="block overflow-x-auto whitespace-pre rounded-md bg-surface px-2.5 py-2 font-mono text-xs text-ink">
                {`curl -X POST -H "Content-Type: application/json" \\\n  -d '{"name":"Ada"}' <webhook URL>`}
              </code>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          The first check only notes what&apos;s already there, so older items don&apos;t start runs. Every run shows up in Zap History.
        </p>
      )}
    </Modal>
  );
}
