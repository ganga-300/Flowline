"use client";

import { useState } from "react";
import { Alert, Button, Modal } from "@/components/ui";
import { cn } from "@/lib/cn";
import { retryOptions, runStatusMeta } from "./runStatus";

const OPTIONS = {
  resume: {
    title: "Retry from the failed step",
    description: "Steps that already worked are skipped and their results reused. The failed step and the ones after it run again.",
  },
  all: {
    title: "Run all steps again",
    description: "Every step runs again with the same trigger data.",
  },
};

/** Confirms a retry. Failed runs can resume from the failed step; others re-run in full. */
export function RetryDialog({ run, retrying, onCancel, onConfirm }) {
  const options = retryOptions(run);
  const [chosen, setChosen] = useState(options[0]);
  const mode = options.includes(chosen) ? chosen : options[0];
  const unknown = run && runStatusMeta(run).label === "Outcome unknown";

  return (
    <Modal
      open={Boolean(run)}
      onClose={() => !retrying && onCancel()}
      title={options.length > 1 ? "Retry this run?" : "Run this again?"}
      description="Flowline starts a new run with the same trigger data. The original run stays in the history."
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={retrying}>Cancel</Button>
          <Button onClick={() => onConfirm(mode)} loading={retrying}>{mode === "resume" ? "Retry from failed step" : "Run all steps"}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {options.length > 1 && (
          <div role="radiogroup" className="space-y-2">
            {options.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mode === id}
                onClick={() => setChosen(id)}
                className={cn(
                  "flex w-full gap-3 rounded-control border p-3 text-left transition cursor-pointer",
                  mode === id ? "border-primary bg-primary-soft ring-2 ring-primary/15" : "border-line hover:border-line-strong"
                )}
              >
                <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", mode === id ? "border-primary" : "border-line-strong")}>
                  {mode === id && <span className="size-2 rounded-full bg-primary" />}
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink">{OPTIONS[id].title}</span>
                  <span className="mt-0.5 block text-sm text-ink-muted">{OPTIONS[id].description}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {mode === "all" && (
          <Alert tone="warning">
            Steps that already worked run again too, so messages, emails or issues the original run sent will be sent a second time.
          </Alert>
        )}
        {mode === "resume" && unknown && (
          <Alert tone="warning">
            The step with an unknown outcome runs again. If it actually went through, it will be sent twice, so check the app first.
          </Alert>
        )}
      </div>
    </Modal>
  );
}
