"use client";

import { useState } from "react";

/**
 * Visual Pill Input Component
 * Displays Mustache variables as styled visual "Pill" tags.
 */
export function PillInput({
  value = "",
  onChange,
  placeholder = "",
  isTextArea = false,
  rows = 4,
}) {
  const [isFocused, setIsFocused] = useState(false);

  // Helper to parse string into plain text and variable token parts
  const parseTokens = (text) => {
    if (!text) return [];
    const regex = /\{\{(.+?)\}\}/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
      }
      const path = match[1].trim();
      const label = path.split(".").pop().replace(/_/g, " ");
      parts.push({ type: "variable", raw: match[0], path, label });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push({ type: "text", content: text.slice(lastIndex) });
    }

    return parts;
  };

  const parts = parseTokens(value);
  const hasVariables = parts.some((p) => p.type === "variable");

  return (
    <div className="relative w-full font-mono text-xs">
      {/* Pill Visual Overlay when not focused or when containing variables */}
      {!isFocused && hasVariables && (
        <div
          onClick={() => setIsFocused(true)}
          className={`w-full bg-[#0d1117] border border-slate-700 rounded-lg p-3 min-h-[42px] cursor-text flex flex-wrap items-center gap-1.5 transition-colors ${
            isTextArea ? `min-h-[${rows * 24}px]` : ""
          }`}
        >
          {parts.map((part, i) =>
            part.type === "variable" ? (
              <span
                key={i}
                className="inline-flex items-center gap-1 bg-[#c4f542] text-[#0d1117] font-semibold font-mono text-[11px] px-2 py-0.5 rounded shadow-sm border border-[#c4f542]/50"
              >
                <span>⚡</span>
                <span>{part.label}</span>
              </span>
            ) : (
              <span key={i} className="text-white whitespace-pre-wrap">
                {part.content}
              </span>
            )
          )}
        </div>
      )}

      {/* Raw Editable Input when focused or when no variables present */}
      {(isFocused || !hasVariables) && (
        isTextArea ? (
          <textarea
            rows={rows}
            value={value}
            placeholder={placeholder}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-[#0d1117] border border-slate-700 rounded-lg p-3 text-xs text-white font-mono placeholder:text-slate-600 focus:border-[#c4f542] focus:ring-1 focus:ring-[#c4f542] outline-none transition-colors"
          />
        ) : (
          <input
            type="text"
            value={value}
            placeholder={placeholder}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white font-mono placeholder:text-slate-600 focus:border-[#c4f542] focus:ring-1 focus:ring-[#c4f542] outline-none transition-colors"
          />
        )
      )}
    </div>
  );
}
