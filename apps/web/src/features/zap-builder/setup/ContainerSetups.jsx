"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Repeat, Trash2 } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { newPath, resolvePath } from "@/lib/stepTree";
import { FILTER_OPERATORS } from "../stepTypes";
import { findListPaths } from "../setupProgress";

let pathSeq = 0;
const newPathId = () => `path-${Date.now().toString(36)}${(pathSeq++).toString(36)}`;

/**
 * A text input for a data path (trigger.issue.title) that suggests the paths found in the
 * sample data and earlier steps, using the browser's own suggestion list.
 */
export function FieldPathInput({ value, onChange, suggestions = [], placeholder = "trigger.issue.title", ...rest }) {
  const listId = useId();
  return (
    <>
      <Input
        list={listId}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-[13px]"
        autoComplete="off"
        spellCheck={false}
        {...rest}
      />
      <datalist id={listId}>
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
    </>
  );
}

function NameField({ draft, updateDraft }) {
  return (
    <Field label="Step name">
      <Input value={draft.name || ""} onChange={(e) => updateDraft({ name: e.target.value })} />
    </Field>
  );
}

/** Rule editor shared by paths: field, operator, value. */
function RuleFields({ condition, onChange, suggestions }) {
  const set = (patch) => onChange({ ...condition, ...patch });
  return (
    <div className="space-y-3">
      <Field label="Only run this path if">
        <FieldPathInput value={condition.path || ""} onChange={(path) => set({ path })} suggestions={suggestions} aria-label="Field to check" />
      </Field>
      <div className={cn("grid gap-2", condition.operator === "EXISTS" ? "grid-cols-1" : "grid-cols-[minmax(0,10rem)_1fr]")}>
        <Select aria-label="Condition" value={condition.operator || "EQUALS"} onChange={(e) => set({ operator: e.target.value })}>
          {FILTER_OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        {condition.operator !== "EXISTS" && (
          <Input aria-label="Value" placeholder="Value" value={condition.value ?? ""} onChange={(e) => set({ value: e.target.value })} />
        )}
      </div>
    </div>
  );
}

/**
 * Paths: each path's name and rule. Paths are checked top to bottom; the first match runs,
 * and "Otherwise" (no rule) runs when none match. Steps are added on the canvas.
 */
export function PathsSetup({ draft, updateDraft, fieldSuggestions = [] }) {
  const paths = draft.paths || [];
  const [confirmDelete, setConfirmDelete] = useState(null);
  const setPaths = (next) => updateDraft({ paths: next });
  const update = (id, patch) => setPaths(paths.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const ruled = paths.filter((p) => p.condition);
  const hasOtherwise = paths.some((p) => !p.condition);

  const move = (id, delta) => {
    const from = paths.findIndex((p) => p.id === id);
    const to = from + delta;
    if (to < 0 || to >= paths.length || !paths[to].condition) return; // Otherwise stays last
    const next = [...paths];
    [next[from], next[to]] = [next[to], next[from]];
    setPaths(next);
  };

  const remove = (path) => {
    if ((path.steps || []).length > 0 && confirmDelete !== path.id) return setConfirmDelete(path.id);
    setConfirmDelete(null);
    setPaths(paths.filter((p) => p.id !== path.id));
  };

  const addPath = () => {
    const path = newPath(paths, newPathId);
    const at = paths.findIndex((p) => !p.condition);
    const next = [...paths];
    next.splice(at === -1 ? next.length : at, 0, path);
    setPaths(next);
  };

  return (
    <div className="space-y-5">
      <NameField draft={draft} updateDraft={updateDraft} />
      <p className="rounded-control bg-subtle px-3.5 py-3 text-sm text-ink-muted">
        Paths are checked from top to bottom. The <span className="font-medium text-ink">first path whose rule matches</span> runs
        {hasOtherwise ? <>, and <span className="font-medium text-ink">Otherwise</span> runs when none match.</> : "; if none match, no path runs."}
        {" "}Add each path&apos;s steps on the canvas.
      </p>

      <ol className="space-y-3">
        {paths.map((path, i) => {
          const stepCount = (path.steps || []).length;
          return (
            <li key={path.id} className={cn("rounded-card border p-4", path.condition ? "border-line bg-surface" : "border-dashed border-line-strong bg-subtle/60")}>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-xs font-semibold text-success">{i + 1}</span>
                {path.condition ? (
                  <input
                    aria-label="Path name"
                    value={path.name}
                    onChange={(e) => update(path.id, { name: e.target.value })}
                    className="min-w-0 flex-1 rounded-control border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-ink hover:border-line focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                ) : (
                  <span className="flex-1 px-1.5 text-sm font-semibold text-ink">Otherwise</span>
                )}
                <span className="shrink-0 text-xs text-ink-faint">{stepCount} step{stepCount === 1 ? "" : "s"}</span>
                {path.condition && (
                  <>
                    <IconButton label="Move path up" onClick={() => move(path.id, -1)} disabled={i === 0}><ArrowUp /></IconButton>
                    <IconButton label="Move path down" onClick={() => move(path.id, 1)} disabled={i >= ruled.length - 1}><ArrowDown /></IconButton>
                  </>
                )}
                <IconButton label={`Delete ${path.name}`} onClick={() => remove(path)} danger><Trash2 /></IconButton>
              </div>
              {confirmDelete === path.id && (
                <p role="alert" className="mb-3 rounded-control bg-danger-soft px-3 py-2 text-xs text-danger">
                  This path has {stepCount} step{stepCount === 1 ? "" : "s"}. Click delete again to remove it and its steps.
                </p>
              )}
              {path.condition ? (
                <RuleFields condition={path.condition} onChange={(condition) => update(path.id, { condition })} suggestions={fieldSuggestions} />
              ) : (
                <p className="text-sm text-ink-muted">Runs when no path above matches.</p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" leftIcon={<Plus className="size-3.5" />} onClick={addPath}>Add path</Button>
        {!hasOtherwise && (
          <Button variant="ghost" size="sm" onClick={() => setPaths([...paths, { id: newPathId(), name: "Otherwise", condition: null, steps: [] }])}>
            Add an &ldquo;Otherwise&rdquo; path
          </Button>
        )}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md p-1.5 text-ink-faint transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 [&_svg]:size-3.5",
        danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-subtle hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

/** Loop: which list to go through; the steps inside run once per item ({{loopItem}}). */
export function LoopSetup({ draft, updateDraft, sampleData }) {
  const config = draft.config || {};
  const setPath = (arrayPath) => updateDraft({ config: { ...config, arrayPath } });
  const lists = findListPaths(sampleData);
  const items = resolvePath({ trigger: sampleData }, (config.arrayPath || "").trim());

  return (
    <div className="space-y-5">
      <NameField draft={draft} updateDraft={updateDraft} />
      <Field label="List to loop over" hint="A list in the trigger data, e.g. trigger.items or trigger.commits.">
        <FieldPathInput value={config.arrayPath || ""} onChange={setPath} suggestions={lists} placeholder="trigger.items" />
      </Field>

      {lists.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-ink-muted">Lists in your trigger&apos;s sample data</p>
          <div className="flex flex-wrap gap-1.5">
            {lists.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => setPath(path)}
                aria-pressed={config.arrayPath === path}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-xs transition cursor-pointer",
                  config.arrayPath === path ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
                )}
              >
                {path}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 rounded-control bg-success-soft/60 px-3.5 py-3 text-sm text-ink-muted">
        <Repeat className="mt-0.5 size-4 shrink-0 text-success" />
        <p>
          {Array.isArray(items) ? <><span className="font-medium text-ink">{items.length} item{items.length === 1 ? "" : "s"}</span> in the sample. </> : null}
          The steps inside the loop run once per item. Use <code className="rounded bg-surface px-1 font-mono text-xs">{"{{loopItem}}"}</code> (or
          {" "}<code className="rounded bg-surface px-1 font-mono text-xs">{"{{loopItem.field}}"}</code>) to insert the current item. A Delay can&apos;t be used inside a loop.
        </p>
      </div>
    </div>
  );
}
