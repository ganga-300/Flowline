"use client";

import { useState } from "react";

function flattenObject(obj, prefix = "") {
  let result = [];
  if (!obj || typeof obj !== "object") return result;

  for (const [key, val] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      result = result.concat(flattenObject(val, newKey));
    } else {
      result.push({ path: newKey, value: String(val) });
    }
  }
  return result;
}

export function DataPicker({ sampleData = {}, steps = [], onSelect, onClose }) {
  const [activeTab, setActiveTab] = useState("trigger");

  const triggerFields = flattenObject(sampleData);

  return (
    <div className="mt-2 p-3 bg-[#0d1117] border border-[#c4f542]/40 rounded-xl shadow-xl space-y-3 z-50">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2 text-xs font-mono text-[#c4f542] font-semibold">
          <span>⚡ Insert Variable Data</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex border-b border-slate-800 text-xs font-mono">
        <button
          type="button"
          onClick={() => setActiveTab("trigger")}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors cursor-pointer ${
            activeTab === "trigger"
              ? "border-[#c4f542] text-[#c4f542]"
              : "text-slate-400 hover:text-slate-200 border-transparent"
          }`}
        >
          Trigger Data
        </button>
        {steps.map((s, idx) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveTab(s.id)}
            className={`px-3 py-1.5 border-b-2 font-medium transition-colors cursor-pointer ${
              activeTab === s.id
                ? "border-[#c4f542] text-[#c4f542]"
                : "text-slate-400 hover:text-slate-200 border-transparent"
            }`}
          >
            Step {idx + 1} ({s.type})
          </button>
        ))}
      </div>

      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 font-mono text-xs">
        {activeTab === "trigger" ? (
          triggerFields.length > 0 ? (
            triggerFields.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => onSelect(`{{trigger.${item.path}}}`)}
                className="w-full text-left p-2 rounded-lg bg-slate-900/80 hover:bg-[#c4f542]/10 border border-slate-800 hover:border-[#c4f542]/40 transition-all flex items-center justify-between group cursor-pointer"
              >
                <span className="text-[#c4f542] font-medium group-hover:underline">
                  trigger.{item.path}
                </span>
                <span className="text-slate-400 text-[11px] truncate max-w-[150px]">
                  {item.value}
                </span>
              </button>
            ))
          ) : (
            <div className="p-3 text-slate-500 text-center italic">
              No trigger sample data found. Click "Test Trigger" to load sample data.
            </div>
          )
        ) : (
          <div className="p-2 space-y-1">
            <button
              type="button"
              onClick={() => onSelect(`{{steps.${activeTab}.output}}`)}
              className="w-full text-left p-2 rounded-lg bg-slate-900/80 hover:bg-[#c4f542]/10 border border-slate-800 hover:border-[#c4f542]/40 transition-all flex items-center justify-between cursor-pointer"
            >
              <span className="text-[#c4f542] font-medium">steps.{activeTab}.output</span>
              <span className="text-slate-400 text-[11px]">Full Output</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
