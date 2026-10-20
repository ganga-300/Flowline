"use client";

import { Field, Input, Select, Textarea } from "@/components/ui";
import { getIntegrationAction } from "@/integrations";
import { ActionIntegrationSelector } from "@/integrations/ActionIntegrationSelector";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** Setup tab for an app action (or a custom HTTP request). */
export function ActionSetup({ draft, updateDraft, sampleData, previousSteps }) {
  const config = draft.config || {};
  const setConfig = (patch) => updateDraft({ config: { ...config, ...patch } });
  const isHttp = !config.provider || config.provider === "custom_http";

  // Name the step after its action until the user types their own name.
  const autoName = (c) => (c.provider ? getIntegrationAction(c.provider, c.action)?.name : c.url !== undefined ? "HTTP request" : null);
  const changeConfig = (newConfig) => {
    const usingAutoName = !draft.name || draft.name === "Choose an app" || draft.name === autoName(config);
    const name = usingAutoName ? autoName(newConfig) || draft.name : draft.name;
    updateDraft({ config: newConfig, name });
  };

  return (
    <div className="space-y-5">
      <Field label="Step name" hint="Shown on the canvas and in run history.">
        <Input value={draft.name || ""} onChange={(e) => updateDraft({ name: e.target.value })} />
      </Field>

      <ActionIntegrationSelector
        config={config}
        sampleData={sampleData}
        steps={previousSteps}
        onChange={changeConfig}
      />

      {isHttp && (
        <>
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <Field label="Method">
              <Select value={config.method || "POST"} onChange={(e) => setConfig({ method: e.target.value })}>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
            <Field label="URL">
              <Input type="url" placeholder="https://api.example.com/hook" value={config.url || ""} onChange={(e) => setConfig({ url: e.target.value })} className="font-mono text-[13px]" />
            </Field>
          </div>
          <Field label="Body (JSON)">
            <Textarea
              rows={6}
              placeholder={'{\n  "event": "new issue"\n}'}
              value={config.body || ""}
              onChange={(e) => setConfig({ body: e.target.value })}
              className="font-mono text-[13px]"
            />
          </Field>
        </>
      )}
    </div>
  );
}
