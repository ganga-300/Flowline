"use client";

import { useState } from "react";
import { DataPicker } from "./DataPicker";

/**
 * Generic Field Renderer for Integration Action & Trigger Form Fields
 * 
 * @param {Object} props
 * @param {import("./types").FieldDefinition} props.field - Field definition schema
 * @param {any} props.value - Current field value
 * @param {Object} [props.sampleData] - Sample data for DataPicker
 * @param {Array} [props.steps] - Steps list for DataPicker
 * @param {(key: string, value: any) => void} props.onChange - Field change callback
 */
export function ActionFieldRenderer({ field, value, sampleData = {}, steps = [], onChange }) {
  const { key, label, type, required, placeholder, description } = field;
  const [showPicker, setShowPicker] = useState(false);

  const handleChange = (e) => {
    onChange(key, e.target.value);
  };

  const handleSelectVariable = (variableToken) => {
    const currentValue = value || "";
    const newValue = currentValue ? `${currentValue} ${variableToken}` : variableToken;
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

      {type === "textarea" ? (
        <textarea
          rows={5}
          value={value || ""}
          placeholder={placeholder || ""}
          onChange={handleChange}
          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg p-3 text-xs text-white font-mono placeholder:text-slate-600 focus:border-[#c4f542] focus:ring-1 focus:ring-[#c4f542] outline-none transition-colors"
        />
      ) : (
        <input
          type="text"
          value={value || ""}
          placeholder={placeholder || ""}
          onChange={handleChange}
          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:border-[#c4f542] focus:ring-1 focus:ring-[#c4f542] outline-none transition-colors"
        />
      )}

      {showPicker && (
        <DataPicker
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
