"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { Alert, Spinner, Toast } from "@/components/ui";
import { useAuthProtection } from "@/lib/useAuthProtection";
import { getIntegration, getIntegrationAction } from "@/integrations";
import { useZapBuilder } from "./useZapBuilder";
import { describeStepCard, describeTriggerCard, stepEyebrow } from "./stepTypes";
import { BuilderHeader } from "./BuilderHeader";
import { StepCard } from "./StepCard";
import { AddStepButton } from "./AddStepButton";
import { StepDrawer } from "./StepDrawer";

const registry = { getIntegration, getIntegrationAction };

/** The Zap editor. Used by /zaps/new and /zaps/[id]/edit (an id in the URL means editing). */
export function ZapBuilder() {
  const { isAuthenticated } = useAuthProtection();
  const params = useParams();
  const builder = useZapBuilder(params?.id || null);
  const { trigger, steps, panel, notice, setNotice, error, setError } = builder;

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  if (!isAuthenticated || builder.isLoadingZap) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-canvas text-sm text-ink-muted">
        <Spinner className="size-4" /> {isAuthenticated ? "Loading Zap…" : "Redirecting to login…"}
      </div>
    );
  }

  const triggerCard = describeTriggerCard(trigger);

  return (
    <div className="min-h-screen bg-canvas">
      <BuilderHeader
        zapName={builder.zapName}
        onRename={builder.setZapName}
        isEditing={builder.isEditing}
        isPublishing={builder.isPublishing}
        onPublish={builder.publish}
      />

      <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] [background-size:20px_20px]">
        <div className="mx-auto flex max-w-xl flex-col items-center px-4 pb-32 pt-10 sm:pt-14">
          {error && !panel && (
            <Alert tone="danger" title={builder.isEditing ? "Couldn't save changes" : "Couldn't publish"} onDismiss={() => setError(null)} className="mb-6 w-full">
              {error}
            </Alert>
          )}

          <StepCard
            number={1}
            eyebrow="Trigger"
            title={triggerCard.title}
            summary={triggerCard.summary}
            app={triggerCard.app}
            iconType={trigger.type}
            configured={trigger.isConfigured}
            active={panel?.target === "trigger"}
            onOpen={builder.openTrigger}
          />
          <AddStepButton onAdd={(type) => builder.addStep(type, 0)} label="Add a step after the trigger" />

          {steps.map((step, idx) => {
            const card = describeStepCard(step, registry);
            return (
              <div key={step.id} className="flex w-full flex-col items-center">
                <StepCard
                  number={idx + 2}
                  eyebrow={stepEyebrow(step.type)}
                  title={card.title}
                  summary={card.summary}
                  app={card.app}
                  iconType={step.type === "ACTION" && !card.app && step.config?.url ? "HTTP" : step.type}
                  configured={step.isConfigured}
                  active={panel?.stepId === step.id}
                  onOpen={() => builder.openStep(step)}
                  onRemove={() => builder.removeStep(step.id)}
                />
                <AddStepButton onAdd={(type) => builder.addStep(type, idx + 1)} label={`Add a step after step ${idx + 2}`} />
              </div>
            );
          })}

          <p className="mt-1 text-center text-xs text-ink-faint">Steps run top to bottom. Each one can use data from the steps above it.</p>
        </div>
      </main>

      <StepDrawer builder={builder} />

      {notice && <Toast tone="success" onClose={() => setNotice(null)}>{notice}</Toast>}
    </div>
  );
}
