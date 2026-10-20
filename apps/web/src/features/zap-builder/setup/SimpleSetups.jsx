"use client";

import { Field, Input, Select, Textarea } from "@/components/ui";
import { FILTER_OPERATORS, formatSeconds } from "../stepTypes";

function NameField({ draft, updateDraft }) {
  return (
    <Field label="Step name">
      <Input value={draft.name || ""} onChange={(e) => updateDraft({ name: e.target.value })} />
    </Field>
  );
}

/** Filter: stop the run unless a field matches. */
export function FilterSetup({ draft, updateDraft }) {
  const config = draft.config || {};
  const setConfig = (patch) => updateDraft({ config: { ...config, ...patch } });
  return (
    <div className="space-y-5">
      <NameField draft={draft} updateDraft={updateDraft} />
      <Field label="Field" hint="Path to a value, e.g. trigger.issue.title or trigger.email.from.">
        <Input placeholder="trigger.issue.title" value={config.path || ""} onChange={(e) => setConfig({ path: e.target.value })} className="font-mono text-[13px]" />
      </Field>
      <Field label="Condition">
        <Select value={config.operator || "EQUALS"} onChange={(e) => setConfig({ operator: e.target.value })}>
          {FILTER_OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      {config.operator !== "EXISTS" && (
        <Field label="Value" hint="Text comparisons ignore upper and lower case.">
          <Input placeholder="bug" value={config.value ?? ""} onChange={(e) => setConfig({ value: e.target.value })} />
        </Field>
      )}
      <p className="rounded-control bg-subtle px-3.5 py-3 text-sm text-ink-muted">
        If the condition is false, the run stops here and shows as <span className="font-medium text-ink">Filtered out</span> in run history.
      </p>
    </div>
  );
}

/** Delay: wait before continuing. */
export function DelaySetup({ draft, updateDraft }) {
  const config = draft.config || {};
  const seconds = Number(config.seconds) || 0;
  return (
    <div className="space-y-5">
      <NameField draft={draft} updateDraft={updateDraft} />
      <Field label="Wait (seconds)" hint={seconds > 0 ? `Waits ${formatSeconds(seconds)}, then runs the next step.` : "Enter how long to wait."}>
        <Input type="number" min="1" value={config.seconds ?? 30} onChange={(e) => updateDraft({ config: { ...config, seconds: e.target.value } })} />
      </Field>
    </div>
  );
}

/** AI prompt: a prompt template filled with trigger data. */
export function AiSetup({ draft, updateDraft }) {
  const config = draft.config || {};
  return (
    <div className="space-y-5">
      <NameField draft={draft} updateDraft={updateDraft} />
      <Field label="Prompt" hint="Use {{trigger.field}} to insert trigger data.">
        <Textarea
          rows={7}
          placeholder="Summarize this issue in one sentence: {{trigger.issue.title}}"
          value={config.prompt || ""}
          onChange={(e) => updateDraft({ config: { ...config, prompt: e.target.value } })}
          className="font-mono text-[13px]"
        />
      </Field>
    </div>
  );
}
