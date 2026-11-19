"use client";

import { useEffect, useRef } from "react";
import { DownloadCloud } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { flattenSample } from "@/integrations/triggerVariables";
import { ValueTable } from "./ValueTable";

const RECORD_NAMES = { github: { new_issue: "issue", new_push: "commit" }, gmail: "email", slack: "message" };

function recordName(provider, event) {
  const r = RECORD_NAMES[provider];
  return typeof r === "string" ? r : r?.[event] || "record";
}

/** Test tab for the trigger: load a real record and show the fields later steps can use. */
export function TriggerTest({ draft, sampleData, sampleStatus, isFetchingSample, onFetchSample }) {
  const provider = draft.config?.provider || "webhook";
  const canFetch = ["github", "gmail", "slack"].includes(provider);
  const isWebhook = provider === "webhook";
  const isPublished = Boolean(draft.id); // a published webhook Flow can show its real requests
  const fields = flattenSample(sampleData).map(({ path, value }) => ({ key: `trigger.${path}`, value }));
  const showingReal = sampleStatus?.tone === "success";

  // A published webhook Flow loads the last request it received as soon as the tab opens.
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (!isWebhook || !isPublished || autoLoaded.current) return;
    autoLoaded.current = true;
    onFetchSample();
  }, [isWebhook, isPublished, onFetchSample]);

  return (
    <div className="space-y-5">
      {canFetch ? (
        <div className="space-y-3 rounded-card border border-line p-4">
          <div>
            <h4 className="text-sm font-semibold text-ink">Load a real {recordName(provider, draft.config?.event)}</h4>
            <p className="mt-0.5 text-sm text-ink-muted">
              Pull the latest one from your connected account, so you build the next steps with real values.
            </p>
          </div>
          <Button variant="outline" onClick={onFetchSample} loading={isFetchingSample} leftIcon={<DownloadCloud className="size-4" />}>
            Load latest {recordName(provider, draft.config?.event)}
          </Button>
          {sampleStatus && <Alert tone={sampleStatus.tone}>{sampleStatus.message}</Alert>}
        </div>
      ) : isWebhook && isPublished ? (
        <div className="space-y-3 rounded-card border border-line p-4">
          <div>
            <h4 className="text-sm font-semibold text-ink">Use a real request</h4>
            <p className="mt-0.5 text-sm text-ink-muted">
              The fields below come from the JSON body of the last request sent to this Flow&apos;s webhook URL.
            </p>
          </div>
          <Button variant="outline" onClick={onFetchSample} loading={isFetchingSample} leftIcon={<DownloadCloud className="size-4" />}>
            Load latest request
          </Button>
          {sampleStatus && <Alert tone={sampleStatus.tone}>{sampleStatus.message}</Alert>}
        </div>
      ) : (
        <p className="rounded-control bg-subtle px-3.5 py-3 text-sm text-ink-muted">
          The trigger data is the JSON body of each request. Publish the Flow to get its URL, send it one
          request, and its real fields will show here. Until then these are example fields.
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h4 className="text-sm font-semibold text-ink">{isWebhook && !showingReal ? "Example fields" : "Available fields"}</h4>
          <span className="text-xs text-ink-faint">{fields.length} fields</span>
        </div>
        <p className="text-sm text-ink-muted">Later steps can insert any of these.</p>
        <ValueTable rows={fields} />
      </div>
    </div>
  );
}
