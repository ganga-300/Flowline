"use client";

import { useEffect, useMemo, useRef } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { stepNumbers } from "@/lib/stepTree";
import { getIntegration, getIntegrationAction } from "@/integrations";
import { getStepOutputVariables } from "@/integrations/stepOutputs";
import { describeStepCard, describeTriggerCard, stepEyebrow } from "./stepTypes";
import { canTest, findValuePaths, setupStages } from "./setupProgress";
import { StepIcon } from "./StepIcon";
import { TriggerSetup } from "./setup/TriggerSetup";
import { ActionSetup } from "./setup/ActionSetup";
import { AiSetup, DelaySetup, FilterSetup } from "./setup/SimpleSetups";
import { LoopSetup, PathsSetup } from "./setup/ContainerSetups";
import { TriggerTest } from "./test/TriggerTest";
import { StepTest } from "./test/StepTest";

const registry = { getIntegration, getIntegrationAction };

/**
 * Right-hand drawer that edits the trigger or one step. A progress strip shows each part
 * (App & event → Account → Configure → Test); Continue goes on to testing. Changes apply on Save.
 */
export function StepDrawer({ builder }) {
  const { panel, draft, closePanel, savePanel, setTab, updateDraft, steps, sampleData, setSampleData, error } = builder;
  const asideRef = useRef(null);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e) => e.key === "Escape" && closePanel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, closePanel]);

  // Move focus into the drawer when it opens, so keyboard users land in it.
  const openKey = panel ? `${panel.target}:${panel.stepId || ""}` : null;
  useEffect(() => {
    if (openKey) asideRef.current?.focus();
  }, [openKey]);

  const { previousStepsFor } = builder;
  const previousSteps = useMemo(
    () => (panel && panel.target !== "trigger" ? previousStepsFor(panel.stepId) : []),
    [panel, previousStepsFor]
  );
  const fieldSuggestions = useMemo(
    () => [...findValuePaths(sampleData), ...previousSteps.flatMap((s) => getStepOutputVariables(s).map((v) => v.path))],
    [sampleData, previousSteps]
  );

  if (!panel || !draft) return null;

  const isTrigger = panel.target === "trigger";
  const card = isTrigger ? describeTriggerCard({ ...draft, isConfigured: true }) : describeStepCard(draft, registry);
  const stepNumber = isTrigger ? 1 : stepNumbers(steps).get(panel.stepId);
  const testable = canTest(isTrigger, draft.type);
  const tested = isTrigger ? builder.sampleStatus?.tone === "success" : builder.testResult?.status === "SUCCESS";
  const stages = setupStages({ isTrigger, draft, tested, getAction: getIntegrationAction });
  const tab = testable ? panel.tab : "setup";
  // Highlighted stage: Test while testing, otherwise the first setup part still to do.
  const currentId = tab === "test" ? "test" : (stages.find((s) => s.tab === "setup" && !s.done) || stages[0])?.id;

  const goToStage = (stage) => {
    setTab(stage.tab);
    if (stage.tab !== "setup") return;
    requestAnimationFrame(() => document.getElementById(`stage-${stage.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  let body;
  if (tab === "test") {
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
    body = <FilterSetup draft={draft} updateDraft={updateDraft} fieldSuggestions={fieldSuggestions} />;
  } else if (draft.type === "DELAY") {
    body = <DelaySetup draft={draft} updateDraft={updateDraft} />;
  } else if (draft.type === "AI") {
    body = <AiSetup draft={draft} updateDraft={updateDraft} />;
  } else if (draft.type === "BRANCH") {
    body = <PathsSetup draft={draft} updateDraft={updateDraft} fieldSuggestions={fieldSuggestions} />;
  } else if (draft.type === "LOOP") {
    body = <LoopSetup draft={draft} updateDraft={updateDraft} sampleData={sampleData} />;
  } else {
    body = <p className="text-sm text-ink-muted">This step type can&apos;t be edited in the builder yet. It&apos;s kept as it is when you save.</p>;
  }

  const titleId = "step-drawer-title";
  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px] animate-fadeIn" onClick={closePanel} />
      <aside
        ref={asideRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[500px] flex-col border-l border-line bg-surface shadow-raised outline-none animate-slideLeft"
      >
        <header className="flex items-start gap-3 px-5 pb-3 pt-4">
          <StepIcon app={isTrigger ? draft.config?.provider : card.app} type={draft.type === "ACTION" && !card.app ? "HTTP" : draft.type} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-ink-faint">{stepNumber}. {stepEyebrow(draft.type)}</p>
            <h2 id={titleId} className="truncate text-base font-semibold text-ink">{card.title}</h2>
          </div>
          <button type="button" onClick={closePanel} aria-label="Close" className="rounded-md p-1.5 text-ink-faint hover:bg-subtle hover:text-ink cursor-pointer">
            <X className="size-4" />
          </button>
        </header>

        {stages.length > 1 && (
          <nav aria-label="Setup progress" className="border-b border-line px-5 pb-3">
            <ol className="flex items-center gap-1 overflow-x-auto">
              {stages.map((stage, i) => {
                const current = stage.id === currentId;
                return (
                  <li key={stage.id} className="flex shrink-0 items-center gap-1">
                    {i > 0 && <span aria-hidden="true" className={cn("h-px w-4", stages[i - 1].done ? "bg-success/50" : "bg-line-strong")} />}
                    <button
                      type="button"
                      onClick={() => goToStage(stage)}
                      aria-current={current ? "step" : undefined}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-medium transition cursor-pointer",
                        current ? "bg-primary-soft text-primary" : "text-ink-muted hover:bg-subtle hover:text-ink"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full text-[11px]",
                          stage.done ? "bg-success text-white" : current ? "bg-primary text-white" : "bg-subtle text-ink-muted"
                        )}
                      >
                        {stage.done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                      </span>
                      {stage.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {error && <Alert tone="danger" className="mb-5">{error}</Alert>}
          {body}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          {testable && tab === "test" ? (
            <>
              <Button variant="ghost" leftIcon={<ArrowLeft className="size-4" />} onClick={() => setTab("setup")} className="mr-auto">Back to setup</Button>
              <Button onClick={savePanel}>Save step</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={closePanel}>Cancel</Button>
              {testable ? (
                <>
                  <Button variant="secondary" onClick={savePanel}>Save</Button>
                  <Button onClick={() => setTab("test")}>
                    Continue <ArrowRight className="size-4" />
                  </Button>
                </>
              ) : (
                <Button onClick={savePanel}>Save step</Button>
              )}
            </>
          )}
        </footer>
      </aside>
    </>
  );
}
