"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Alert, Button, Tabs } from "@/components/ui";
import { getIntegration, getIntegrationAction } from "@/integrations";
import { getPreviousSteps } from "@/integrations/stepOutputs";
import { describeStepCard, describeTriggerCard, stepEyebrow } from "./stepTypes";
import { StepIcon } from "./StepIcon";
import { TriggerSetup } from "./setup/TriggerSetup";
import { ActionSetup } from "./setup/ActionSetup";
import { AiSetup, DelaySetup, FilterSetup } from "./setup/SimpleSetups";
import { TriggerTest } from "./test/TriggerTest";
import { StepTest } from "./test/StepTest";

const registry = { getIntegration, getIntegrationAction };
const TABS = [{ id: "setup", label: "Setup" }, { id: "test", label: "Test" }];

/** Right-hand drawer that edits the trigger or one step. Changes apply on "Save step". */
export function StepDrawer({ builder }) {
  const { panel, draft, closePanel, savePanel, setTab, updateDraft, steps, sampleData, setSampleData, error } = builder;

  useEffect(() => {
    if (!panel) return;
    const onKey = (e) => e.key === "Escape" && closePanel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, closePanel]);

  if (!panel || !draft) return null;

  const isTrigger = panel.target === "trigger";
  const card = isTrigger ? describeTriggerCard({ ...draft, isConfigured: true }) : describeStepCard(draft, registry);
  const previousSteps = isTrigger ? [] : getPreviousSteps(steps, panel.stepId);
  const stepNumber = isTrigger ? 1 : steps.findIndex((s) => s.id === panel.stepId) + 2;

  let body;
  if (panel.tab === "test") {
    body = isTrigger ? (
      <TriggerTest draft={draft} sampleData={sampleData} sampleStatus={builder.sampleStatus} isFetchingSample={builder.isFetchingSample} onFetchSample={builder.fetchSample} />
    ) : (
      <StepTest draft={draft} testResult={builder.testResult} isTesting={builder.isTesting} onTest={builder.testStep} />
    );
  } else if (isTrigger) {
    body = <TriggerSetup draft={draft} updateDraft={updateDraft} setSampleData={setSampleData} />;
  } else if (draft.type === "ACTION") {
    body = <ActionSetup draft={draft} updateDraft={updateDraft} sampleData={sampleData} previousSteps={previousSteps} />;
  } else if (draft.type === "FILTER") {
    body = <FilterSetup draft={draft} updateDraft={updateDraft} />;
  } else if (draft.type === "DELAY") {
    body = <DelaySetup draft={draft} updateDraft={updateDraft} />;
  } else if (draft.type === "AI") {
    body = <AiSetup draft={draft} updateDraft={updateDraft} />;
  } else {
    body = <p className="text-sm text-ink-muted">This step type can&apos;t be edited in the builder yet. It&apos;s kept as it is when you save.</p>;
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px]" onClick={closePanel} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={isTrigger ? "Edit trigger" : `Edit step ${stepNumber}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-line bg-surface shadow-raised"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <StepIcon app={isTrigger ? draft.config?.provider : card.app} type={draft.type === "ACTION" && !card.app ? "HTTP" : draft.type} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-ink-faint">{stepNumber}. {stepEyebrow(draft.type)}</p>
            <h2 className="truncate text-base font-semibold text-ink">{card.title}</h2>
          </div>
          <button type="button" onClick={closePanel} aria-label="Close" className="rounded-md p-1.5 text-ink-faint hover:bg-subtle hover:text-ink cursor-pointer">
            <X className="size-4" />
          </button>
        </header>

        <div className="border-b border-line px-5 py-3">
          <Tabs items={TABS} value={panel.tab} onChange={setTab} />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {error && <Alert tone="danger" className="mb-5">{error}</Alert>}
          {body}
        </div>

        <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="ghost" onClick={closePanel}>Cancel</Button>
          <Button onClick={savePanel}>Save step</Button>
        </footer>
      </aside>
    </>
  );
}
