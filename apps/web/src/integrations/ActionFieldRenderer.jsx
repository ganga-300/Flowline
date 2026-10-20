"use client";

import { useEffect, useState } from "react";
import { Braces, Plus, Wand2 } from "lucide-react";
import { authFetch } from "@/lib/api";
import { Select, Switch } from "@/components/ui";
import { PillInput } from "./PillInput";
import { VariablePickerModal } from "./VariablePickerModal";
import { getQuickChips, getSmartTemplate } from "./triggerVariables";

/**
 * One field of an integration action: text/textarea (with data insertion), dropdown,
 * dynamic_dropdown (options loaded from the connected account), boolean_toggle, array.
 */
export function ActionFieldRenderer({ field, providerId, value, connectionId, sampleData = {}, steps = [], onChange }) {
  const { key, label, type, dynamic, required, placeholder, description, optionsType, options: staticOptions } = field;
  const [showPicker, setShowPicker] = useState(false);
  const [dynamicOptions, setDynamicOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState(null);

  const isText = type === "text" || type === "textarea" || type === "pill_input";
  // Ready-made templates only for messaging actions (Slack and Gmail).
  const isTemplatableField = isText && ["text", "body", "message", "subject", "title"].includes(key);
  const quickChips = isTemplatableField ? getQuickChips(sampleData) : [];
  const suggestedTemplate = (providerId === "slack" || providerId === "gmail") && isTemplatableField ? getSmartTemplate(sampleData, key) : "";

  useEffect(() => {
    if (!((type === "dynamic_dropdown" || dynamic) && connectionId && optionsType)) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoadingOptions(true);
      setOptionsError(null);
    });
    authFetch(`/connections/${connectionId}/options?type=${optionsType}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setDynamicOptions([]);
          setOptionsError(data.error || `Couldn't load choices (HTTP ${res.status})`);
        } else {
          setDynamicOptions(data.options || []);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setDynamicOptions([]);
        setOptionsError("Can't reach the Flowline server to load choices.");
      })
      .finally(() => !cancelled && setLoadingOptions(false));
    return () => {
      cancelled = true;
    };
  }, [type, dynamic, connectionId, optionsType]);

  const append = (token) => onChange(key, value ? `${value} ${token}` : token);
  const options =
    type === "dropdown" ? (dynamic ? dynamicOptions : staticOptions || []) :
    dynamicOptions.length > 0 ? dynamicOptions : staticOptions || [];
  const selectPlaceholder =
    dynamic && !connectionId ? "Choose an account first" :
    loadingOptions ? "Loading choices…" :
    "Select an option";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
        <div className="flex items-center gap-1">
          {suggestedTemplate && (
            <button type="button" onClick={() => onChange(key, suggestedTemplate)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary-soft cursor-pointer" title="Fill in a ready-made message with the trigger's details">
              <Wand2 className="size-3.5" /> Use template
            </button>
          )}
          {value && isText && (
            <button type="button" onClick={() => onChange(key, "")} className="rounded-md px-1.5 py-0.5 text-xs text-ink-muted hover:bg-subtle hover:text-ink cursor-pointer">Clear</button>
          )}
          {isText && (
            <button
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              aria-expanded={showPicker}
              className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-xs font-medium text-ink-muted hover:border-line-strong hover:text-ink cursor-pointer"
            >
              <Braces className="size-3.5" /> Insert data
            </button>
          )}
        </div>
      </div>

      {quickChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {quickChips.map((chip) => (
            <button
              key={chip.token}
              type="button"
              onClick={() => append(chip.token)}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-ink-muted hover:border-primary/40 hover:bg-primary-soft hover:text-primary cursor-pointer"
            >
              <Plus className="size-3" />
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {type === "dropdown" || type === "dynamic_dropdown" ? (
        <Select value={value || ""} onChange={(e) => onChange(key, e.target.value)} disabled={loadingOptions || (dynamic && !connectionId)}>
          <option value="">{selectPlaceholder}</option>
          {options.map((opt) => (
            <option key={opt.value || opt} value={opt.value || opt}>{opt.label || opt}</option>
          ))}
        </Select>
      ) : type === "boolean_toggle" ? (
        <Switch checked={!!value} onChange={(checked) => onChange(key, checked)} label={value ? "On" : "Off"} />
      ) : type === "array" ? (
        <PillInput
          value={Array.isArray(value) ? value.join(", ") : value || ""}
          placeholder={placeholder || "one@example.com, two@example.com"}
          onChange={(v) => onChange(key, v.split(",").map((s) => s.trim()))}
        />
      ) : (
        <PillInput value={value || ""} placeholder={placeholder || ""} isTextArea={type === "textarea"} rows={type === "textarea" ? 5 : 1} onChange={(v) => onChange(key, v)} />
      )}

      {showPicker && (
        <VariablePickerModal
          sampleData={sampleData}
          steps={steps}
          onSelect={(item) => {
            append(typeof item === "string" ? item : item.token);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {optionsError && <p className="text-xs text-danger">{optionsError}</p>}
      {description && <p className="text-xs text-ink-muted">{description}</p>}
    </div>
  );
}
