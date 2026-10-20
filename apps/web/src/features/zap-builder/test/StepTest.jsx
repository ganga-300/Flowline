"use client";

import { Play } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { ValueTable } from "./ValueTable";

/** Test tab for a step: run it once with the sample trigger data. */
export function StepTest({ draft, testResult, isTesting, onTest }) {
  const realWarning =
    draft.type !== "ACTION" ? null :
    draft.config?.provider ? "This really runs the action, so it will post the message, send the email or create the issue." :
    "This really sends the HTTP request.";
  const ok = testResult?.status === "SUCCESS";
  const output = testResult?.output && typeof testResult.output === "object"
    ? Object.entries(testResult.output).map(([key, v]) => ({ key, value: typeof v === "object" ? JSON.stringify(v) : String(v) }))
    : [];

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-card border border-line p-4">
        <div>
          <h4 className="text-sm font-semibold text-ink">Test this step</h4>
          <p className="mt-0.5 text-sm text-ink-muted">Runs the step once with the sample trigger data, using your unsaved settings.</p>
        </div>
        {realWarning && <Alert tone="warning">{realWarning}</Alert>}
        <Button onClick={onTest} loading={isTesting} leftIcon={<Play className="size-4" />}>Run test</Button>
      </div>

      {testResult && (
        <div className="space-y-3">
          <Alert tone={ok ? "success" : "danger"} title={ok ? "Step worked" : "Step failed"}>
            {!ok && (testResult.error || "No details returned.")}
            {ok && output.length === 0 && "It finished without returning any fields."}
          </Alert>
          {output.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-ink">Output</h4>
              <ValueTable rows={output} keyLabel="Key" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
