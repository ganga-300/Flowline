"use client";

import { getIntegrationAction } from "./index";
import { ActionFieldRenderer } from "./ActionFieldRenderer";

/**
 * Dynamic Action Form Renderer
 * Reads fields from selected integration action schema and renders field inputs.
 * 
 * @param {Object} props
 * @param {string} props.providerId - Integration provider ID (e.g. 'gmail')
 * @param {string} props.actionId - Action ID (e.g. 'send_email')
 * @param {Object} props.values - Current field values object { to: '...', subject: '...' }
 * @param {Object} [props.sampleData] - Sample trigger data for DataPicker
 * @param {Array} [props.steps] - All steps for DataPicker
 * @param {(newValues: Object) => void} props.onChange - Callback when any field value changes
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
      <div className="text-xs font-mono text-[#c4f542] font-semibold tracking-wide uppercase">
        {action.name} Configuration
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
