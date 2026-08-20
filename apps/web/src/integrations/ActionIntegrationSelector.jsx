"use client";

import { integrationsList, getIntegration } from "./index";
import { ActionFormRenderer } from "./ActionFormRenderer";
import { ConnectionSelector } from "./ConnectionSelector";

export function ActionIntegrationSelector({ config, onChange }) {
  const selectedProvider = config?.provider || "custom_http";
  const selectedAction = config?.action || "";
  const connectionId = config?.connectionId || null;
  const actionValues = config?.config || {};

  const currentIntegration = getIntegration(selectedProvider);
  const availableActions = currentIntegration?.actions || [];

  const handleProviderChange = (e) => {
    const provider = e.target.value;
    if (provider === "custom_http") {
      onChange({
        method: config?.method || "POST",
        url: config?.url || "",
        body: config?.body || "",
      });
    } else {
      const integration = getIntegration(provider);
      const firstAction = integration?.actions[0]?.id || "";
      onChange({
        provider,
        action: firstAction,
        connectionId: null,
        config: {},
      });
    }
  };

  const handleActionChange = (e) => {
    const action = e.target.value;
    onChange({
      provider: selectedProvider,
      action,
      connectionId,
      config: {},
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1.5">
          App / Integration
        </label>
        <select
          value={selectedProvider}
          onChange={handleProviderChange}
          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:border-[#c4f542] outline-none"
        >
          <option value="custom_http">HTTP (Custom Request)</option>
          {integrationsList.map((integration) => (
            <option key={integration.id} value={integration.id}>
              {integration.name}
            </option>
          ))}
        </select>
      </div>

      {selectedProvider !== "custom_http" && (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Action
            </label>
            <select
              value={selectedAction}
              onChange={handleActionChange}
              className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:border-[#c4f542] outline-none"
            >
              <option value="" disabled>
                Select an action
              </option>
              {availableActions.map((action) => (
                <option key={action.id} value={action.id}>
                  {action.name}
                </option>
              ))}
            </select>
          </div>

          {selectedAction && (
            <>
              <ConnectionSelector
                providerId={selectedProvider}
                providerName={currentIntegration?.name || "App"}
                connectionId={connectionId}
                connections={[]}
                onChange={(newConnId) => {
                  onChange({
                    provider: selectedProvider,
                    action: selectedAction,
                    connectionId: newConnId,
                    config: actionValues,
                  });
                }}
              />

              <ActionFormRenderer
                providerId={selectedProvider}
                actionId={selectedAction}
                values={actionValues}
                onChange={(newFieldValues) => {
                  onChange({
                    provider: selectedProvider,
                    action: selectedAction,
                    connectionId,
                    config: newFieldValues,
                  });
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

