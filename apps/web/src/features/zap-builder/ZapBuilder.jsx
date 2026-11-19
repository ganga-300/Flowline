"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileQuestion } from "lucide-react";
import { Alert, Button, Field, Input, Modal, Spinner, Toast } from "@/components/ui";
import { useAuthProtection } from "@/lib/useAuthProtection";
import { flattenSteps, ROOT, stepNumbers } from "@/lib/stepTree";
import { getIntegration, getIntegrationAction } from "@/integrations";
import { useZapBuilder } from "./useZapBuilder";
import { describeStepCard, describeTriggerCard } from "./stepTypes";
import { missingSetup } from "./setupProgress";
import { PublishedDialog } from "./PublishedDialog";
import { BuilderHeader } from "./BuilderHeader";
import { StepCard } from "./StepCard";
import { AddStepButton } from "./AddStepButton";
import { StepList } from "./StepList";
import { StepDrawer } from "./StepDrawer";

const registry = { getIntegration, getIntegrationAction };
const ROOT_WIDTH = "w-[min(36rem,calc(100vw-2rem))]";

/** The Zap editor. Used by /zaps/new and /zaps/[id]/edit (an id in the URL means editing). */
export function ZapBuilder() {
  const { isAuthenticated } = useAuthProtection();
  const params = useParams();
  const router = useRouter();
  const builder = useZapBuilder(params?.id || null);
  const { trigger, steps, panel, notice, setNotice, error, setError } = builder;

  const [renamingId, setRenamingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // a step with steps inside it
  const [undo, setUndo] = useState(null); // { steps, label } to put back after a delete
  const [leaving, setLeaving] = useState(false);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  const numbers = useMemo(() => stepNumbers(steps), [steps]);

  // "Name your Zap" starts from a suggestion built from the trigger and the first step.
  const { askName } = builder;
  useEffect(() => {
    if (!askName) return;
    const first = steps[0] ? describeStepCard(steps[0], registry).title : null;
    queueMicrotask(() => setNameInput([describeTriggerCard(trigger).title, first].filter(Boolean).join(" → ")));
  }, [askName, trigger, steps]);

  if (!isAuthenticated || builder.isLoadingZap) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-canvas text-sm text-ink-muted">
        <Spinner className="size-4" /> {isAuthenticated ? "Loading Zap…" : "Redirecting to login…"}
      </div>
    );
  }

  // Editing a Zap that doesn't exist (deleted, or a bad link) or couldn't be loaded.
  if (builder.loadError) {
    const { notFound, message } = builder.loadError;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-subtle text-ink-muted">
          <FileQuestion className="size-6" />
        </span>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-ink">{notFound ? "This Zap doesn't exist" : "Couldn't load this Zap"}</h1>
          <p className="max-w-sm text-sm text-ink-muted">
            {notFound ? "It may have been deleted, or the link is wrong." : message}
          </p>
        </div>
        <div className="flex gap-2">
          {!notFound && <Button variant="secondary" onClick={() => window.location.reload()}>Try again</Button>}
          <Button href="/dashboard">Back to Zaps</Button>
        </div>
      </div>
    );
  }

  // Deleting can be undone for a few seconds; a step with steps inside asks first.
  const deleteStep = (step) => {
    const inside = flattenSteps([step]).length - 1;
    if (inside > 0 && !pendingDelete) return setPendingDelete({ step, inside });
    setUndo({ steps, label: step.name || "Step" });
    builder.removeStep(step.id);
    setPendingDelete(null);
  };

  const leave = () => (builder.isDirty ? setLeaving(true) : router.push("/dashboard"));

  const ctx = { builder, registry, numbers, renamingId, setRenamingId, onDelete: deleteStep };
  const triggerCard = describeTriggerCard(trigger);
  const stepCount = flattenSteps(steps).length + 1;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <BuilderHeader
        zapName={builder.zapName}
        onRename={builder.setZapName}
        isEditing={builder.isEditing}
        isDirty={builder.isDirty}
        isPublishing={builder.isPublishing}
        onPublish={() => builder.publish()}
        onLeave={leave}
      />

      <main className="flex-1 overflow-x-auto bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] [background-size:20px_20px]">
        <div className="mx-auto flex w-max min-w-full flex-col items-center px-4 pb-40 pt-10 sm:pt-14">
          {error && !panel && (
            <Alert tone="danger" title={builder.errorKind === "connect" ? "Couldn't connect" : builder.isEditing ? "Couldn't save changes" : "Couldn't publish"} onDismiss={() => setError(null)} className={`mb-6 ${ROOT_WIDTH}`}>
              {error}
            </Alert>
          )}

          <div className={ROOT_WIDTH}>
            <StepCard
              number={1}
              eyebrow="Trigger"
              title={triggerCard.title}
              summary={triggerCard.summary}
              app={triggerCard.app}
              iconType={trigger.type}
              configured={!missingSetup({ isTrigger: true, draft: trigger, getAction: getIntegrationAction })}
              active={panel?.target === "trigger"}
              onOpen={builder.openTrigger}
            />
          </div>
          <AddStepButton onAdd={(type) => builder.addStep(type, ROOT, 0)} label="Add a step after the trigger" />

          <StepList steps={steps} where={ROOT} ctx={ctx} width={ROOT_WIDTH} />

          <p className="mt-1 max-w-[min(24rem,calc(100vw-2rem))] text-center text-xs text-ink-faint">
            {stepCount} step{stepCount === 1 ? "" : "s"} · Steps run top to bottom, and each can use data from the steps above it.
          </p>
        </div>
      </main>

      <StepDrawer builder={builder} />

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={`Delete "${pendingDelete?.step.name || "this step"}"?`}
        description={`The ${pendingDelete?.inside} step${pendingDelete?.inside === 1 ? "" : "s"} inside it will be deleted too. You can undo this right after.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => deleteStep(pendingDelete.step)}>Delete</Button>
          </>
        }
      />

      <Modal
        open={leaving}
        onClose={() => setLeaving(false)}
        title="Leave without saving?"
        description={builder.isEditing ? "Your changes to this Zap haven't been saved." : "This Zap hasn't been published yet, so it will be lost."}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaving(false)}>Keep editing</Button>
            <Button variant="danger" onClick={() => router.push("/dashboard")}>Discard changes</Button>
          </>
        }
      />

      <Modal
        open={builder.askName}
        onClose={() => builder.setAskName(false)}
        title="Name your Zap"
        description="You'll see this name on your dashboard, in run history and in alerts."
        footer={
          <>
            <Button variant="secondary" onClick={() => builder.setAskName(false)}>Cancel</Button>
            <Button onClick={() => builder.publish({ name: nameInput })} disabled={!nameInput.trim()} loading={builder.isPublishing}>
              Publish
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nameInput.trim()) builder.publish({ name: nameInput });
          }}
        >
          <Field label="Zap name" htmlFor="zap-name">
            <Input id="zap-name" autoFocus value={nameInput} maxLength={120} onChange={(e) => setNameInput(e.target.value)} onFocus={(e) => e.target.select()} />
          </Field>
        </form>
      </Modal>

      <PublishedDialog zap={builder.published} onDone={() => router.push("/dashboard")} />

      {undo ? (
        <Toast tone="info" onClose={() => setUndo(null)}>
          <span className="flex items-center justify-between gap-3">
            <span className="truncate">Deleted &ldquo;{undo.label}&rdquo;</span>
            <button
              type="button"
              onClick={() => {
                builder.restoreSteps(undo.steps);
                setUndo(null);
              }}
              className="shrink-0 font-semibold text-primary hover:underline cursor-pointer"
            >
              Undo
            </button>
          </span>
        </Toast>
      ) : (
        notice && <Toast tone="success" onClose={() => setNotice(null)}>{notice}</Toast>
      )}
    </div>
  );
}
