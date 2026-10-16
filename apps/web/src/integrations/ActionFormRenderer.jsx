"use client";

import { getIntegrationAction } from "./index";
import { ActionFieldRenderer } from "./ActionFieldRenderer";

/**
 * Dynamic Action Form Renderer
 * Reads fields from selected integration action schema (Gmail, Slack, GitHub)
 * and renders configurable input fields.
 */
export function ActionFormRenderer({ providerId, actionId, connectionId, values = {}, sampleData = {}, steps = [], onChange }) {
  const action = getIntegrationAction(providerId, actionId);

  if (!action || !action.fields || action.fields.length === 0) {
    return (
      <div className="p-4 bg-[#0d1117] border border-slate-800 rounded-lg text-xs text-slate-400">
        No configurable fields available for this action.
      </div>
    );
  }

  const handleFieldChange = (key, value) => {
    onChange({
      ...values,
      [key]: value,
    });
  };

  return (
    <div className="space-y-4 pt-2 border-t border-slate-800/80">
      <div className="text-xs font-mono text-[#c4f542] font-semibold tracking-wide uppercase flex items-center justify-between">
        <span>{action.name} Configuration</span>
      </div>

      {action.fields.map((field) => (
        <ActionFieldRenderer
          key={field.key}
          field={field}
          value={values[field.key]}
          connectionId={connectionId}
          sampleData={sampleData}
          steps={steps}
          onChange={handleFieldChange}
        />
      ))}
    </div>
  );
}
