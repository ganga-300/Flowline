"use client";

import { getIntegrationAction } from "./index";
import { ActionFieldRenderer } from "./ActionFieldRenderer";

/** Renders the fields defined by an integration action (Gmail, Slack, GitHub). */
export function ActionFormRenderer({ providerId, actionId, connectionId, values = {}, sampleData = {}, steps = [], onChange }) {
  const action = getIntegrationAction(providerId, actionId);

  if (!action?.fields?.length) {
    return <p className="rounded-control bg-subtle px-3.5 py-3 text-sm text-ink-muted">This action has no settings.</p>;
  }

  return (
    <div className="space-y-5 border-t border-line pt-5">
      {action.fields.map((field) => (
        <ActionFieldRenderer
          key={field.key}
          field={field}
          providerId={providerId}
          value={values[field.key]}
          connectionId={connectionId}
          sampleData={sampleData}
          steps={steps}
          onChange={(key, value) => onChange({ ...values, [key]: value })}
        />
      ))}
    </div>
  );
}
