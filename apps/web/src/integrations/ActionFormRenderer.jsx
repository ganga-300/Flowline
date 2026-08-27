"use client";

import { useEffect, useState } from "react";
import { getIntegrationAction } from "./index";
import { ActionFieldRenderer } from "./ActionFieldRenderer";
import { authFetch } from "@/lib/api";

/**
 * Dynamic Action Form Renderer
 * Reads fields from selected integration action schema, listens to parent field changes (`dependsOn`),
 * and dynamically renders child fields.
 */
export function ActionFormRenderer({ providerId, actionId, connectionId, values = {}, sampleData = {}, steps = [], onChange }) {
  const action = getIntegrationAction(providerId, actionId);
  const [dependentFields, setDependentFields] = useState([]);
  const [loadingDeps, setLoadingDeps] = useState(false);

  // Watch for parent field changes (e.g. spreadsheetId) to fetch dependent child fields
  useEffect(() => {
    if (connectionId && providerId && values.spreadsheetId) {
      fetchDependentFields("spreadsheetId", values.spreadsheetId);
    }
  }, [connectionId, providerId, values.spreadsheetId]);

  const fetchDependentFields = async (parentKey, parentValue) => {
    try {
      setLoadingDeps(true);
      const url = `http://localhost:4000/connections/${connectionId}/dynamic-fields?provider=${providerId}&action=${actionId}&parentKey=${parentKey}&parentValue=${encodeURIComponent(parentValue)}`;
      const res = await authFetch(url);
      const data = await res.json();
      setDependentFields(data.fields || []);
    } catch (err) {
      console.error("Failed to fetch dependent fields", err);
    } finally {
      setLoadingDeps(false);
    }
  };

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

  const allFields = [...action.fields, ...dependentFields];

  return (
    <div className="space-y-4 pt-2 border-t border-slate-800/80">
      <div className="text-xs font-mono text-[#c4f542] font-semibold tracking-wide uppercase flex items-center justify-between">
        <span>{action.name} Configuration</span>
        {loadingDeps && (
          <span className="text-[11px] font-mono text-[#c4f542] animate-pulse flex items-center gap-1">
            <span>⏳</span> Loading Worksheet Tabs...
          </span>
        )}
      </div>

      {allFields.map((field) => (
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
