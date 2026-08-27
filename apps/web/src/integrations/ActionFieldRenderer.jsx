"use client";

import { useEffect, useState } from "react";
import { PillInput } from "./PillInput";
import { VariablePickerModal } from "./VariablePickerModal";
import { authFetch } from "@/lib/api";

/**
 * Generic Field Renderer for Integration Action & Trigger Form Fields
 * Supports text, textarea, dropdown, dynamic_dropdown, boolean_toggle, and array.
 */
export function ActionFieldRenderer({ field, value, connectionId, sampleData = {}, steps = [], onChange }) {
  const { key, label, type, required, placeholder, description, optionsType, options: staticOptions } = field;
  const [showPicker, setShowPicker] = useState(false);
  const [dynamicOptions, setDynamicOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    if (type === "dynamic_dropdown" && connectionId && optionsType) {
      loadDynamicOptions();
    }
  }, [type, connectionId, optionsType]);

  const loadDynamicOptions = async () => {
    try {
      setLoadingOptions(true);
      const res = await authFetch(`http://localhost:4000/connections/${connectionId}/options?type=${optionsType}`);
      const data = await res.json();
      setDynamicOptions(data.options || []);
    } catch (err) {
      console.error("Failed to load options", err);
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

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>

        {(type === "text" || type === "textarea") && (
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            className="text-[11px] font-mono text-[#c4f542] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>⚡ Insert Variable</span>
          </button>
        )}
      </div>

      {type === "dropdown" ? (
        <select
          value={value || ""}
          onChange={(e) => onChange(key, e.target.value)}
          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white font-mono focus:border-[#c4f542] outline-none"
        >
          <option value="">Select an option...</option>
          {(staticOptions || []).map((opt) => (
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
            {dynamicOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
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

      {description && (
        <p className="text-[11px] text-slate-500 mt-1 font-sans">{description}</p>
      )}
    </div>
  );
}
