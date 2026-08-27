"use client";

import { useState } from "react";
import { PillInput } from "./PillInput";
import { VariablePickerModal } from "./VariablePickerModal";

/**
 * Generic Field Renderer for Integration Action & Trigger Form Fields
 */
export function ActionFieldRenderer({ field, value, sampleData = {}, steps = [], onChange }) {
  const { key, label, type, required, placeholder, description } = field;
  const [showPicker, setShowPicker] = useState(false);

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

        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="text-[11px] font-mono text-[#c4f542] hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>⚡ Insert Variable</span>
        </button>
      </div>

      <PillInput
        value={value || ""}
        placeholder={placeholder || ""}
        isTextArea={type === "textarea"}
        rows={type === "textarea" ? 5 : 1}
        onChange={(newVal) => onChange(key, newVal)}
      />

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
