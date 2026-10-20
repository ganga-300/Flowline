"use client";

import { useEffect, useState } from "react";
import { PillInput } from "./PillInput";
import { VariablePickerModal } from "./VariablePickerModal";
import { authFetch } from "@/lib/api";
import { getQuickChips, getSmartTemplate } from "./triggerVariables";

/**
 * Generic Field Renderer for Integration Action & Trigger Form Fields
 * Supports text, textarea, dropdown, dynamic_dropdown, boolean_toggle, and array.
 */
export function ActionFieldRenderer({ field, providerId, value, connectionId, sampleData = {}, steps = [], onChange }) {
  const { key, label, type, dynamic, required, placeholder, description, optionsType, options: staticOptions } = field;
  const [showPicker, setShowPicker] = useState(false);
  const [dynamicOptions, setDynamicOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState(null);

  // Default templates are ONLY for messaging actions (Slack and Gmail)
  const isMessagingAction = providerId === "slack" || providerId === "gmail";
  const isTemplatableField =
    (type === "text" || type === "textarea" || type === "pill_input") &&
    (key === "text" || key === "body" || key === "message" || key === "subject" || key === "title");

  const quickChips = isTemplatableField ? getQuickChips(sampleData) : [];
  const suggestedTemplate = (isMessagingAction && isTemplatableField) ? getSmartTemplate(sampleData, key) : "";

  useEffect(() => {
    if ((type === "dynamic_dropdown" || dynamic) && connectionId && optionsType) {
      loadDynamicOptions();
    }
  }, [type, dynamic, connectionId, optionsType]);

  const loadDynamicOptions = async () => {
    try {
      setLoadingOptions(true);
      setOptionsError(null);
      const res = await authFetch(`/connections/${connectionId}/options?type=${optionsType}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDynamicOptions([]);
        setOptionsError(data.error || `Could not load choices (HTTP ${res.status})`);
        return;
      }
      setDynamicOptions(data.options || []);
    } catch (err) {
      console.error("Failed to load options", err);
      setDynamicOptions([]);
      setOptionsError("Could not reach the Flowline server to load choices.");
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleSelectVariable = (item) => {
    const token = typeof item === "string" ? item : item.token;
    const currentValue = value || "";
    const newValue = currentValue ? `${currentValue} ${token}` : token;
    onChange(key, newValue);
    setShowPicker(false);
  };

  const handleInsertChip = (token) => {
    const currentValue = value || "";
    const newValue = currentValue ? `${currentValue} ${token}` : token;
    onChange(key, newValue);
  };

  return (
    <div className="relative space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>

        <div className="flex items-center gap-2">
          {suggestedTemplate && (
            <button
              type="button"
              onClick={() => onChange(key, suggestedTemplate)}
              className="text-[11px] font-mono text-[#c4f542] hover:underline flex items-center gap-1 cursor-pointer"
              title="Click to fill in a pre-made template with all issue/event details"
            >
              <span>✨ Use Default Template</span>
            </button>
          )}

          {value && (
            <button
              type="button"
              onClick={() => onChange(key, "")}
              className="text-[11px] font-mono text-slate-400 hover:text-white hover:underline cursor-pointer"
            >
              Clear
            </button>
          )}

          {(type === "text" || type === "textarea" || type === "pill_input") && (
            <button
              type="button"
              onClick={() => setShowPicker(!showPicker)}
              className="text-[11px] font-mono text-slate-300 hover:text-[#c4f542] flex items-center gap-1 cursor-pointer border border-slate-700 hover:border-[#c4f542]/50 px-2 py-0.5 rounded"
            >
              <span>⚡ All Variables</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick-Click Variable Chips */}
      {quickChips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pb-1">
          <span className="text-[10px] font-mono text-slate-500 uppercase">Insert:</span>
          {quickChips.map((chip) => (
            <button
              key={chip.token}
              type="button"
              onClick={() => handleInsertChip(chip.token)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-800 hover:bg-[#c4f542]/20 text-slate-300 hover:text-[#c4f542] border border-slate-700 hover:border-[#c4f542]/50 transition-colors cursor-pointer"
            >
              <span>+</span>
              <span>{chip.label}</span>
            </button>
          ))}
        </div>
      )}

      {type === "dropdown" ? (
        <select
          value={value || ""}
          onChange={(e) => onChange(key, e.target.value)}
          disabled={dynamic && loadingOptions}
          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white font-mono focus:border-[#c4f542] outline-none disabled:opacity-50"
        >
          <option value="">
            {dynamic && !connectionId
              ? "Select an account above first"
              : dynamic && loadingOptions
                ? "Loading Choices..."
                : "Select an option..."}
          </option>
          {(dynamic ? dynamicOptions : staticOptions || []).map((opt) => (
            <option key={opt.value || opt} value={opt.value || opt}>
              {opt.label || opt}
            </option>
          ))}
        </select>
      ) : type === "dynamic_dropdown" ? (
        <div className="relative">
          <select
            value={value || ""}
            onChange={(e) => onChange(key, e.target.value)}
            disabled={loadingOptions}
            className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white font-mono focus:border-[#c4f542] outline-none disabled:opacity-50"
          >
            <option value="">
              {loadingOptions ? "Loading Choices..." : "Select from choice list..."}
            </option>
            {(dynamicOptions.length > 0 ? dynamicOptions : staticOptions || []).map((opt) => (
              <option key={opt.value || opt} value={opt.value || opt}>
                {opt.label || opt}
              </option>
            ))}
          </select>
        </div>
      ) : type === "boolean_toggle" ? (
        <label className="flex items-center gap-3 cursor-pointer py-1">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(key, e.target.checked)}
            className="w-4 h-4 accent-[#c4f542] rounded cursor-pointer"
          />
          <span className="text-xs text-slate-300 font-mono">
            {value ? "Enabled (True)" : "Disabled (False)"}
          </span>
        </label>
      ) : type === "array" ? (
        <PillInput
          value={Array.isArray(value) ? value.join(", ") : value || ""}
          placeholder={placeholder || "email1@example.com, email2@example.com"}
          isTextArea={false}
          onChange={(newVal) => onChange(key, newVal.split(",").map((s) => s.trim()))}
        />
      ) : (
        <PillInput
          value={value || ""}
          placeholder={placeholder || ""}
          isTextArea={type === "textarea"}
          rows={type === "textarea" ? 5 : 1}
          onChange={(newVal) => onChange(key, newVal)}
        />
      )}

      {showPicker && (
        <VariablePickerModal
          sampleData={sampleData}
          steps={steps}
          onSelect={handleSelectVariable}
          onClose={() => setShowPicker(false)}
        />
      )}

      {(dynamic || type === "dynamic_dropdown") && optionsError && (
        <p className="text-[11px] text-red-400 mt-1 font-sans">{optionsError}</p>
      )}

      {description && (
        <p className="text-[11px] text-slate-500 mt-1 font-sans">{description}</p>
      )}
    </div>
  );
}
