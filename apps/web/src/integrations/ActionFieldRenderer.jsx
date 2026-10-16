"use client";

import { useEffect, useState } from "react";
import { PillInput } from "./PillInput";
import { VariablePickerModal } from "./VariablePickerModal";
import { authFetch } from "@/lib/api";

function getTriggerType(sampleData) {
  if (sampleData?.issue || sampleData?.body?.number || sampleData?.body?.repo || sampleData?.body?.user_login) {
    return "github";
  }
  if (sampleData?.email || sampleData?.body?.from || sampleData?.body?.date) {
    return "gmail";
  }
  if (sampleData?.message || sampleData?.body?.ts) {
    return "slack";
  }
  return "generic";
}

// ── Helper to generate a pre-formatted default message based on the trigger ──
function getSmartTemplate(sampleData, fieldKey) {
  const triggerType = getTriggerType(sampleData);

  if (fieldKey === "subject") {
    if (triggerType === "github") return "🚨 New GitHub Issue: {{issue.title}}";
    if (triggerType === "gmail") return "Fwd: {{email.subject}}";
    if (triggerType === "slack") return "New Slack Notification from {{message.user}}";
    return "New Flowline Notification";
  }

  if (fieldKey === "text" || fieldKey === "body" || fieldKey === "message") {
    if (triggerType === "github") {
      return "🚨 New GitHub Issue #{{issue.number}}: {{issue.title}}\n\nAuthor: {{issue.user_login}}\nView issue: {{issue.html_url}}";
    }
    if (triggerType === "gmail") {
      return "📩 New Email Received\nFrom: {{email.from}}\nSubject: {{email.subject}}\n\n{{email.body}}";
    }
    if (triggerType === "slack") {
      return "💬 New Slack message in {{message.channel}} by {{message.user}}:\n{{message.text}}";
    }
    return "Notification received:\n{{message}}";
  }

  return "";
}

// ── Helper to extract 1-click variable chips from the active trigger ──
function getQuickChips(sampleData) {
  const triggerType = getTriggerType(sampleData);

  if (triggerType === "github") {
    return [
      { label: "Issue Title", token: "{{issue.title}}" },
      { label: "Issue URL", token: "{{issue.html_url}}" },
      { label: "Issue #", token: "{{issue.number}}" },
      { label: "Author", token: "{{issue.user_login}}" },
      { label: "Repository", token: "{{repository.full_name}}" },
    ];
  }
  if (triggerType === "gmail") {
    return [
      { label: "Subject", token: "{{email.subject}}" },
      { label: "Sender", token: "{{email.from}}" },
      { label: "Email Body", token: "{{email.body}}" },
      { label: "Date", token: "{{email.date}}" },
    ];
  }
  if (triggerType === "slack") {
    return [
      { label: "Message Text", token: "{{message.text}}" },
      { label: "User", token: "{{message.user}}" },
      { label: "Channel", token: "{{message.channel}}" },
    ];
  }

  if (sampleData?.body && typeof sampleData.body === "object") {
    return Object.keys(sampleData.body).slice(0, 5).map((k) => ({
      label: k.replace(/_/g, " "),
      token: `{{${k}}}`,
    }));
  }

  return [];
}

/**
 * Generic Field Renderer for Integration Action & Trigger Form Fields
 * Supports text, textarea, dropdown, dynamic_dropdown, boolean_toggle, and array.
 */
export function ActionFieldRenderer({ field, providerId, value, connectionId, sampleData = {}, steps = [], onChange }) {
  const { key, label, type, dynamic, required, placeholder, description, optionsType, options: staticOptions } = field;
  const [showPicker, setShowPicker] = useState(false);
  const [dynamicOptions, setDynamicOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Default templates are ONLY for messaging actions (Slack and Gmail)
  const isMessagingAction = providerId === "slack" || providerId === "gmail";
  const isTemplatableField =
    (type === "text" || type === "textarea" || type === "pill_input") &&
    (key === "text" || key === "body" || key === "message" || key === "subject");

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
      const res = await authFetch(`/connections/${connectionId}/options?type=${optionsType}`);
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
          <option value="">{dynamic && loadingOptions ? "Loading Choices..." : "Select an option..."}</option>
          {(dynamic && dynamicOptions.length > 0 ? dynamicOptions : staticOptions || []).map((opt) => (
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

      {description && (
        <p className="text-[11px] text-slate-500 mt-1 font-sans">{description}</p>
      )}
    </div>
  );
}
