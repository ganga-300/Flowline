"use client";

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
  const fields = flattenSample(sampleData).map(({ path, value }) => ({ key: `trigger.${path}`, value }));

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
      ) : (
        <p className="rounded-control bg-subtle px-3.5 py-3 text-sm text-ink-muted">
          Webhook Zaps use the request body as trigger data. These are example fields until a real request arrives.
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h4 className="text-sm font-semibold text-ink">Available fields</h4>
          <span className="text-xs text-ink-faint">{fields.length} fields</span>
        </div>
        <p className="text-sm text-ink-muted">Later steps can insert any of these.</p>
        <ValueTable rows={fields} />
      </div>
    </div>
  );
}
