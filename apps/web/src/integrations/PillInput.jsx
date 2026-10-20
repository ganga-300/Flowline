"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { controlClasses } from "@/components/ui/Input";

// "{{trigger.issue.title}}" -> [{ type: "variable", label: "title", path }, { type: "text", ... }]
function parseTokens(text) {
  if (!text) return [];
  const regex = /\{\{(.+?)\}\}/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    const path = match[1].trim();
    parts.push({ type: "variable", path, label: path.split(".").pop().replace(/_/g, " ") });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push({ type: "text", content: text.slice(lastIndex) });
  return parts;
}

/**
 * Text input that shows inserted {{data}} tokens as readable pills while not focused.
 * Click it to edit the raw text.
 */
export function PillInput({ value = "", onChange, placeholder = "", isTextArea = false, rows = 4 }) {
  const [isFocused, setIsFocused] = useState(false);
  const parts = parseTokens(value);
  const hasVariables = parts.some((p) => p.type === "variable");

  if (!isFocused && hasVariables) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsFocused(true)}
        onFocus={() => setIsFocused(true)}
        className={cn(controlClasses, "flex cursor-text flex-wrap items-center gap-1 py-2 leading-relaxed", isTextArea ? "min-h-28 items-start content-start" : "min-h-10")}
      >
        {parts.map((part, i) =>
          part.type === "variable" ? (
            <span key={i} title={part.path} className="inline-flex items-center rounded-md border border-primary/20 bg-primary-soft px-1.5 py-px text-xs font-medium text-primary">
              {part.label}
            </span>
          ) : (
            <span key={i} className="whitespace-pre-wrap text-sm text-ink">{part.content}</span>
          )
        )}
      </div>
    );
  }

  const shared = {
    value,
    placeholder,
    autoFocus: isFocused && hasVariables,
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
    onChange: (e) => onChange(e.target.value),
  };
  return isTextArea ? (
    <textarea rows={rows} {...shared} className={cn(controlClasses, "py-2 leading-relaxed")} />
  ) : (
    <input type="text" {...shared} className={cn(controlClasses, "h-10")} />
  );
}
