"use client";

import { Fragment } from "react";
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { allowedKinds, canMove } from "@/lib/stepTree";
import { describePathRule, describeStepCard, stepEyebrow } from "./stepTypes";
import { StepCard } from "./StepCard";
import { AddStepButton } from "./AddStepButton";

/**
 * One list of steps on the canvas (the main list, a path, or a loop body), with a + between
 * cards. Paths and Loops draw their own lists inside them, so this is recursive.
 * ctx: { builder, registry, numbers, renamingId, setRenamingId, onDelete }
 * width: the card width class for this list.
 */
export function StepList({ steps, where, ctx, width, emptyLabel }) {
  if (steps.length === 0 && where.kind !== "root") {
    return (
      <div className={cn("flex flex-col items-center", width)}>
        <span aria-hidden="true" className="h-5 w-px bg-line-strong" />
        <AddStepButton variant="slot" label={emptyLabel} onAdd={(type) => ctx.builder.addStep(type, where, 0)} isAllowed={allowedKinds(where, 0)} />
      </div>
    );
  }
  return (
    <>
      {/* The main list's first + sits under the trigger card (ZapBuilder draws it). */}
      {where.kind !== "root" && <AddStepButton onAdd={(type) => ctx.builder.addStep(type, where, 0)} isAllowed={allowedKinds(where, 0)} label="Add a step here" />}
      {steps.map((step, index) => (
        <Fragment key={step.id}>
          <StepNode step={step} ctx={ctx} width={width} />
          <AddStepButton
            onAdd={(type) => ctx.builder.addStep(type, where, index + 1)}
            isAllowed={allowedKinds(where, index + 1)}
            label={`Add a step after step ${ctx.numbers.get(step.id)}`}
          />
        </Fragment>
      ))}
    </>
  );
}

function StepNode({ step, ctx, width }) {
  const { builder, registry, numbers } = ctx;
  const card = describeStepCard(step, registry);
  const number = numbers.get(step.id);

  const menuItems = [
    { label: "Rename", icon: Pencil, onSelect: () => ctx.setRenamingId(step.id) },
    { label: "Duplicate", icon: Copy, onSelect: () => builder.duplicateStep(step.id) },
    { label: "Move up", icon: ArrowUp, onSelect: () => builder.moveStep(step.id, -1), disabled: !canMove(builder.steps, step.id, -1) },
    { label: "Move down", icon: ArrowDown, onSelect: () => builder.moveStep(step.id, 1), disabled: !canMove(builder.steps, step.id, 1) },
    { label: "Delete", icon: Trash2, onSelect: () => ctx.onDelete(step), danger: true },
  ];

  return (
    <>
      <div className={width}>
        <StepCard
          number={number}
          eyebrow={stepEyebrow(step.type)}
          title={card.title}
          summary={card.summary}
          app={card.app}
          iconType={step.type === "ACTION" && !card.app && step.config?.url ? "HTTP" : step.type}
          configured={step.isConfigured}
          active={builder.panel?.stepId === step.id}
          onOpen={() => builder.openStep(step)}
          menuItems={menuItems}
          renaming={ctx.renamingId === step.id}
          onRenameDone={(name) => {
            if (ctx.renamingId !== step.id) return;
            ctx.setRenamingId(null);
            if (name && name.trim() && name.trim() !== card.title) builder.renameStep(step.id, name.trim());
          }}
        />
      </div>
      {step.type === "BRANCH" && <PathsBlock step={step} ctx={ctx} />}
      {step.type === "LOOP" && <LoopBlock step={step} ctx={ctx} width={width} />}
    </>
  );
}

/** A Paths step's paths, side by side: each has its rule on top and its own steps below. */
function PathsBlock({ step, ctx }) {
  const paths = step.paths || [];
  return (
    <div className="flex flex-col items-center">
      <span aria-hidden="true" className="h-5 w-px bg-line-strong" />
      <div className="flex items-start gap-4">
        {paths.map((path, i) => (
          <div key={path.id} className="relative flex min-w-[18rem] flex-col items-center px-1">
            {/* Branch lines: across the top to each path, then down to its rule. */}
            {paths.length > 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-0 h-px bg-line-strong",
                  i === 0 ? "left-1/2 -right-2" : i === paths.length - 1 ? "-left-2 right-1/2" : "-left-2 -right-2"
                )}
              />
            )}
            <span aria-hidden="true" className="h-4 w-px bg-line-strong" />
            <button
              type="button"
              onClick={() => ctx.builder.openStep(step)}
              className={cn(
                "w-[18rem] rounded-control border px-3.5 py-2.5 text-left transition cursor-pointer hover:shadow-card",
                path.condition ? "border-success/30 bg-success-soft/50 hover:border-success/60" : "border-line bg-subtle hover:border-line-strong"
              )}
            >
              <span className="block text-[13px] font-semibold text-ink">{path.name}</span>
              <span className={cn("mt-0.5 block truncate text-xs", path.condition && !path.condition.path ? "text-warning" : "text-ink-muted")}>
                {describePathRule(path.condition)}
              </span>
            </button>
            <StepList
              steps={path.steps || []}
              where={{ kind: "path", stepId: step.id, pathId: path.id }}
              ctx={ctx}
              width="w-[18rem]"
              emptyLabel="Add the first step of this path"
            />
          </div>
        ))}
        <div className="flex flex-col items-center pt-4">
          <button
            type="button"
            onClick={() => ctx.builder.addPath(step.id)}
            className="flex h-[3.75rem] items-center gap-1.5 rounded-control border border-dashed border-line-strong px-4 text-sm font-medium text-ink-muted transition hover:border-primary hover:text-primary cursor-pointer"
          >
            <Plus className="size-4" /> Add path
          </button>
        </div>
      </div>
      <p className="mt-3 rounded-full bg-subtle px-3 py-1 text-xs text-ink-muted">Only the first matching path runs, then the steps below</p>
    </div>
  );
}

/** A Loop's body: the steps that run once per item. */
function LoopBlock({ step, ctx, width }) {
  return (
    <div className={cn("flex flex-col items-center", width)}>
      <span aria-hidden="true" className="h-5 w-px bg-line-strong" />
      <div className="w-full rounded-card border border-dashed border-success/40 bg-success-soft/30 px-3 pb-3 pt-2.5 sm:px-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-success">
          <Repeat className="size-3.5" />
          {step.config?.arrayPath ? `For each item in ${step.config.arrayPath}` : "For each item"}
        </p>
        <div className="flex flex-col items-center">
          <StepList
            steps={step.steps || []}
            where={{ kind: "loop", stepId: step.id }}
            ctx={ctx}
            width="w-full"
            emptyLabel="Add a step to run for each item"
          />
        </div>
      </div>
    </div>
  );
}
