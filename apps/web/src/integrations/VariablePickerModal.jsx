"use client";

import { useState } from "react";

function formatLabel(path) {
  const parts = path.split(".");
  const key = parts[parts.length - 1];
  return key
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function flattenObject(obj, prefix = "") {
  let result = [];
  if (!obj || typeof obj !== "object") return result;

  for (const [key, val] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      result = result.concat(flattenObject(val, newKey));
    } else {
      result.push({ path: newKey, label: formatLabel(newKey), value: String(val) });
    }
  }
  return result;
}

export function VariablePickerModal({ sampleData = {}, steps = [], onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("trigger");

  const triggerFields = flattenObject(sampleData);
  const filteredTriggerFields = triggerFields.filter(
    (f) =>
      f.path.toLowerCase().includes(search.toLowerCase()) ||
      f.label.toLowerCase().includes(search.toLowerCase()) ||
      f.value.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mt-2 p-3 bg-[#161b22] border border-[#c4f542]/40 rounded-xl shadow-2xl space-y-3 z-50 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2 text-xs font-mono text-[#c4f542] font-semibold">
          <span>⚡ Select Variable Data</span>
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

      <input
        type="text"
        placeholder="Search variables..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-[#c4f542]"
      />

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
          Trigger Payload
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

      <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 font-mono text-xs">
        {activeTab === "trigger" ? (
          filteredTriggerFields.length > 0 ? (
            filteredTriggerFields.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() =>
                  onSelect({
                    token: `{{trigger.${item.path}}}`,
                    label: item.label,
                    path: `trigger.${item.path}`,
                  })
                }
                className="w-full text-left p-2 rounded-lg bg-[#0d1117] hover:bg-[#c4f542]/10 border border-slate-800 hover:border-[#c4f542]/40 transition-all flex items-center justify-between group cursor-pointer"
              >
                <div>
                  <div className="text-white font-medium text-xs flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-[#c4f542]/20 text-[#c4f542] text-[10px] font-bold">
                      {item.label}
                    </span>
                    <span className="text-slate-400 text-[11px]">trigger.{item.path}</span>
                  </div>
                </div>
                <span className="text-slate-400 text-[11px] truncate max-w-[120px] bg-slate-900 px-2 py-0.5 rounded">
                  {item.value}
                </span>
              </button>
            ))
          ) : (
            <div className="p-3 text-slate-500 text-center italic text-xs">
              No matching trigger variables found.
            </div>
          )
        ) : (
          <div className="p-2 space-y-1">
            <button
              type="button"
              onClick={() =>
                onSelect({
                  token: `{{steps.${activeTab}.output}}`,
                  label: `Step ${activeTab} Output`,
                  path: `steps.${activeTab}.output`,
                })
              }
              className="w-full text-left p-2 rounded-lg bg-[#0d1117] hover:bg-[#c4f542]/10 border border-slate-800 hover:border-[#c4f542]/40 transition-all flex items-center justify-between cursor-pointer"
            >
              <span className="text-[#c4f542] font-medium">steps.{activeTab}.output</span>
              <span className="text-slate-400 text-[11px]">Full Step Output</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
