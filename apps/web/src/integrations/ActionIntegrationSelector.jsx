"use client";

import { Globe } from "lucide-react";
import { Field, Select } from "@/components/ui";
import { AppIcon } from "@/components/icons/AppIcon";
import { cn } from "@/lib/cn";
import { integrationsList, getIntegration } from "./index";
import { ActionFormRenderer } from "./ActionFormRenderer";
import { ConnectionSelector } from "./ConnectionSelector";

/** App + action + account + the action's fields, for an ACTION step. */
export function ActionIntegrationSelector({ config, sampleData = {}, steps = [], onChange }) {
  const selectedProvider = config?.provider || "custom_http";
  const selectedAction = config?.action || "";
  const connectionId = config?.connectionId || null;
  const actionValues = config?.config || {};

  const currentIntegration = getIntegration(selectedProvider);
  const availableActions = currentIntegration?.actions || [];

  const chooseProvider = (provider) => {
    if (provider === selectedProvider) return;
    if (provider === "custom_http") {
      onChange({ method: config?.method || "POST", url: config?.url || "", body: config?.body || "" });
    } else {
      const integration = getIntegration(provider);
      onChange({ provider, action: integration?.actions[0]?.id || "", connectionId: null, config: {} });
    }
  };

  const apps = [...integrationsList.map((i) => ({ id: i.id, name: i.name })), { id: "custom_http", name: "HTTP request" }];

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-ink">App</p>
        <div className="grid grid-cols-2 gap-2">
          {apps.map((app) => {
            const selected = app.id === selectedProvider;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => chooseProvider(app.id)}
                aria-pressed={selected}
                className={cn(
                  "flex items-center gap-2.5 rounded-control border px-3 py-2.5 text-left text-sm font-medium transition cursor-pointer",
                  selected ? "border-primary bg-primary-soft text-ink ring-2 ring-primary/15" : "border-line bg-surface text-ink hover:border-line-strong"
                )}
              >
                {app.id === "custom_http" ? (
                  <span className="inline-flex size-7 items-center justify-center rounded-control border border-line bg-surface"><Globe className="size-3.5" /></span>
                ) : (
                  <AppIcon app={app.id} size="sm" />
                )}
                {app.name}
              </button>
            );
          })}
        </div>
      </div>

      {selectedProvider !== "custom_http" && (
        <>
          <Field label="Action">
            <Select
              value={selectedAction}
              onChange={(e) => onChange({ provider: selectedProvider, action: e.target.value, connectionId, config: {} })}
            >
              <option value="" disabled>Select an action</option>
              {availableActions.map((action) => <option key={action.id} value={action.id}>{action.name}</option>)}
            </Select>
          </Field>

          {selectedAction && (
            <>
              <ConnectionSelector
                providerId={selectedProvider}
                providerName={currentIntegration?.name || "App"}
                connectionId={connectionId}
                onChange={(newConnId) => onChange({ provider: selectedProvider, action: selectedAction, connectionId: newConnId, config: actionValues })}
              />
              <ActionFormRenderer
                providerId={selectedProvider}
                actionId={selectedAction}
                connectionId={connectionId}
                values={actionValues}
                sampleData={sampleData}
                steps={steps}
                onChange={(newFieldValues) => onChange({ provider: selectedProvider, action: selectedAction, connectionId, config: newFieldValues })}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
