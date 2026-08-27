"use client";

import { useState,useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/api";
import { useAuthProtection } from "@/lib/useAuthProtection";
import { getIntegration, getIntegrationAction } from "@/integrations";
import { ActionIntegrationSelector } from "@/integrations/ActionIntegrationSelector";

// ── Icons ────────────────────────────────────────────────────────────
function ZapIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function WebhookIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function PollingIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function ActionIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  );
}

function AIIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function FilterIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  );
}

function DelayIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function PlusIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function XIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function EditIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function CheckIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// Helper to return icon for step type
function getStepIcon(type) {
  switch (type) {
    case "WEBHOOK":
      return <WebhookIcon className="w-5 h-5 text-[#c4f542]" />;
    case "POLLING":
      return <PollingIcon className="w-5 h-5 text-[#c4f542]" />;
    case "ACTION":
      return <ActionIcon className="w-5 h-5 text-[#c4f542]" />;
    case "AI":
      return <AIIcon className="w-5 h-5 text-[#c4f542]" />;
    case "FILTER":
      return <FilterIcon className="w-5 h-5 text-[#c4f542]" />;
    case "DELAY":
      return <DelayIcon className="w-5 h-5 text-[#c4f542]" />;
    default:
      return <ZapIcon className="w-5 h-5 text-[#c4f542]" />;
  }
}

export default function NewZapBuilderPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthProtection();

  // ── Zap State ──
  const [zapName, setZapName] = useState("Untitled Zap");
  const [isEditingName, setIsEditingName] = useState(false);

  // Trigger state
  const [trigger, setTrigger] = useState({
    type: "WEBHOOK", // "WEBHOOK" | "POLLING"
    config: {
      url: "",
    },
    pollIntervalSec: 60,
    isConfigured: false,
  });

  // Steps state array
  const [steps, setSteps] = useState([
    {
      id: "step-1",
      type: "ACTION",
      name: "HTTP Request Action",
      config: {
        method: "POST",
        url: "",
        body: "",
      },
      isConfigured: false,
    },
  ]);

  // ── UI State ──
  // activePanel: { target: 'trigger' | 'step', stepId?: string, tab: 'setup' | 'test' } | null
  const [activePanel, setActivePanel] = useState(null);
  const [stepSelectorIndex, setStepSelectorIndex] = useState(null); // index to insert step after
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);
  const [successToast, setSuccessToast] = useState(null);
  const [sampleData, setSampleData] = useState({
    body: {
      email: "user@example.com",
      name: "Alex Smith",
      subject: "New Registration",
      message: "Hello from Flowline!",
    },
  });

  // Process return query params from Google OAuth redirect (/zaps/new?connected=gmail&connectionId=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const connected = urlParams.get("connected");
    const connectionIdParam = urlParams.get("connectionId");
    const errorParam = urlParams.get("error");

    if (connected === "gmail" && connectionIdParam) {
      queueMicrotask(() => {
        setSuccessToast("Gmail connected successfully!");
        setSteps((prevSteps) =>
          prevSteps.map((s) => {
            if (s.type === "ACTION" && s.config?.provider === "gmail") {
              return {
                ...s,
                isConfigured: true,
                config: {
                  ...s.config,
                  connectionId: connectionIdParam,
                },
              };
            }
            return s;
          })
        );
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorParam) {
      queueMicrotask(() => {
        setPublishError(errorParam);
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Draft state for side panel editing
  const [panelDraft, setPanelDraft] = useState(null);

  // Open side panel
  const openTriggerPanel = () => {
    setPanelDraft({ ...trigger });
    setActivePanel({ target: "trigger", tab: "setup" });
    setPublishError(null);
  };

  const openStepPanel = (step) => {
    setPanelDraft({ ...step, config: { ...step.config } });
    setActivePanel({ target: "step", stepId: step.id, tab: "setup" });
    setPublishError(null);
  };

  const closePanel = () => {
    setActivePanel(null);
    setPanelDraft(null);
  };

  // Add step
  const addStep = (type, insertIndex) => {
    const newId = `step-${Date.now()}`;
    let defaultStep = {
      id: newId,
      type,
      name: "",
      config: {},
      isConfigured: false,
    };

    switch (type) {
      case "ACTION":
        defaultStep.name = "HTTP Request";
        defaultStep.config = { method: "POST", url: "", body: "" };
        break;
      case "AI":
        defaultStep.name = "AI Prompt Transform";
        defaultStep.config = { prompt: "" };
        break;
      case "FILTER":
        defaultStep.name = "Filter Condition";
        defaultStep.config = { path: "", operator: "EQUALS", value: "" };
        break;
      case "DELAY":
        defaultStep.name = "Delay Execution";
        defaultStep.config = { seconds: 30 };
        break;
    }

    const updated = [...steps];
    updated.splice(insertIndex, 0, defaultStep);
    setSteps(updated);
    setStepSelectorIndex(null);

    // Open side panel for newly added step
    setPanelDraft({ ...defaultStep });
    setActivePanel({ target: "step", stepId: newId, tab: "setup" });
  };

  // Remove step
  const removeStep = (id, e) => {
    e.stopPropagation();
    setSteps(steps.filter((s) => s.id !== id));
    if (activePanel?.stepId === id) {
      closePanel();
    }
  };

  // Save side panel draft into main state
  const handleSavePanel = () => {
    if (!panelDraft) return;

    if (activePanel.target === "trigger") {
      setTrigger({
        ...panelDraft,
        isConfigured: true,
      });
    } else if (activePanel.target === "step") {
      setSteps(
        steps.map((s) =>
          s.id === activePanel.stepId
            ? { ...panelDraft, isConfigured: true }
            : s
        )
      );
    }
    closePanel();
  };

  // One-line summary generators
  const getTriggerSummary = () => {
    if (!trigger.isConfigured) return "Not configured yet";
    if (trigger.type === "WEBHOOK") {
      return "WEBHOOK • Catch incoming webhook HTTP requests";
    }
    return `POLLING • ${trigger.config.url || "URL not set"} (${trigger.pollIntervalSec || 60}s interval)`;
  };

  const getStepSummary = (step) => {
    if (!step.isConfigured) return "Click to configure parameters";
    switch (step.type) {
      case "ACTION":
        if (step.config?.provider) {
          const provider = getIntegration(step.config.provider);
          const action = getIntegrationAction(step.config.provider, step.config.action);
          return `${provider?.name || step.config.provider} → ${action?.name || step.config.action}`;
        }
        return `${step.config.method || "GET"} ${step.config.url || "URL missing"}`;
      case "AI":
        return step.config.prompt
          ? `Prompt: "${step.config.prompt.slice(0, 45)}${step.config.prompt.length > 45 ? "..." : ""}"`
          : "Prompt configured";
      case "FILTER":
        return `If ${step.config.path || "path"} ${step.config.operator || "EQUALS"} "${step.config.value || ""}"`;
      case "DELAY":
        return `Delay for ${step.config.seconds || 0} seconds`;
      default:
        return "Configured";
    }
  };

  // Publish to backend
  const handlePublish = async () => {
    setPublishError(null);
    setIsPublishing(true);

    try {
      // Build request body according to backend requirements
      const payload = {
        name: zapName.trim() || "Untitled Zap",
        status: "ENABLED",
        trigger: {
          type: trigger.type,
          config: trigger.type === "POLLING" ? { url: trigger.config.url } : {},
          ...(trigger.type === "POLLING" && {
            pollIntervalSec: Number(trigger.pollIntervalSec) || 60,
          }),
        },
        steps: steps.map((s, idx) => {
          let stepConfig = {};
          if (s.type === "ACTION") {
            if (s.config?.provider) {
              stepConfig = {
                provider: s.config.provider,
                action: s.config.action || "",
                ...s.config,
              };
            } else {
              let parsedBody = s.config.body;
              if (typeof s.config.body === "string" && s.config.body.trim().startsWith("{")) {
                try {
                  parsedBody = JSON.parse(s.config.body);
                } catch {
                  parsedBody = s.config.body;
                }
              }
              stepConfig = {
                url: s.config.url || "",
                method: s.config.method || "POST",
                body: parsedBody || {},
              };
            }
          } else if (s.type === "AI") {
            stepConfig = {
              prompt: s.config.prompt || "",
            };
          } else if (s.type === "FILTER") {
            stepConfig = {
              condition: {
                path: s.config.path || "",
                operator: s.config.operator || "EQUALS",
                value: s.config.value || "",
              },
            };
          } else if (s.type === "DELAY") {
            stepConfig = {
              seconds: Number(s.config.seconds) || 0,
            };
          }

          return {
            type: s.type,
            name: s.name || `${s.type} Step`,
            order: idx,
            ...(s.config?.connectionId && { connectionId: s.config.connectionId }),
            config: stepConfig,
          };
        }),
      };

      const res = await authFetch("http://localhost:4000/zaps", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }

      // Success -> Redirect to dashboard
      router.push("/dashboard");
    } catch (err) {
      setPublishError(err.message || "Failed to publish Zap. Please check your configuration.");
    } finally {
      setIsPublishing(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center font-mono text-xs text-slate-400">
        Redirecting to login...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] font-sans flex flex-col relative overflow-x-hidden selection:bg-[#c4f542]/30">
      {/* ── Top Header Bar ── */}
      <header className="h-16 border-b border-slate-800/80 bg-[#161b22]/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            title="Back to Dashboard"
          >
            <div className="w-8 h-8 rounded-lg bg-[#c4f542]/10 border border-[#c4f542]/30 flex items-center justify-center text-[#c4f542]">
              <ZapIcon className="w-5 h-5" />
            </div>
          </Link>
          <div className="h-5 w-[1px] bg-slate-800" />
          
          {/* Editable Zap Name */}
          <div className="flex items-center gap-2">
            {isEditingName ? (
              <input
                type="text"
                value={zapName}
                onChange={(e) => setZapName(e.target.value)}
                onBlur={() => setIsEditingName(false)}
                onKeyDown={(e) => e.key === "Enter" && setIsEditingName(false)}
                autoFocus
                className="bg-[#0d1117] border border-[#c4f542] text-white px-3 py-1 rounded text-lg font-semibold outline-none focus:ring-2 focus:ring-[#c4f542]/50"
              />
            ) : (
              <div
                onClick={() => setIsEditingName(true)}
                className="group flex items-center gap-2 cursor-pointer hover:bg-slate-800/60 px-3 py-1 rounded-lg transition-colors"
              >
                <h1 className="text-lg font-semibold tracking-tight text-white">{zapName}</h1>
                <EditIcon className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              DRAFT
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePublish}
            disabled={isPublishing}
            className="bg-[#c4f542] hover:bg-[#b0e030] text-black font-semibold px-5 py-2 rounded-lg transition-all shadow-[0_0_15px_rgba(196,245,66,0.2)] hover:shadow-[0_0_25px_rgba(196,245,66,0.35)] flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isPublishing ? (
              <>
                <svg className="animate-spin w-4 h-4 text-black" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Publishing...</span>
              </>
            ) : (
              <>
                <ZapIcon className="w-4 h-4" />
                <span>Publish</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── Global Top Success Toast (OAuth completion) ── */}
      {successToast && (
        <div className="bg-[#c4f542]/10 border-b border-[#c4f542]/30 text-[#c4f542] px-6 py-3 text-sm flex items-center justify-between font-mono animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="font-bold">✓ Success:</span>
            <span>{successToast}</span>
          </div>
          <button
            onClick={() => setSuccessToast(null)}
            className="text-slate-400 hover:text-white"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Global Top Error Banner (if error occurred on publish) ── */}
      {publishError && !activePanel && (
        <div className="bg-red-950/80 border-b border-red-700 text-red-200 px-6 py-3 text-sm flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="font-bold">Error publishing Zap:</span>
            <span>{publishError}</span>
          </div>
          <button
            onClick={() => setPublishError(null)}
            className="text-red-300 hover:text-white"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Vertical Node Canvas Container ── */}
      <main className="flex-1 max-w-xl w-full mx-auto py-12 px-4 flex flex-col items-center pb-32">
        
        {/* ── Step 1: Trigger Card ── */}
        <div
          onClick={openTriggerPanel}
          className={`w-full rounded-xl p-5 cursor-pointer transition-all duration-200 relative group shadow-lg ${
            trigger.isConfigured
              ? "bg-[#161b22] border-2 border-[#c4f542]/60 hover:border-[#c4f542] shadow-[0_0_20px_rgba(196,245,66,0.06)]"
              : "bg-[#161b22]/60 border-2 border-dashed border-slate-700 hover:border-slate-500 hover:bg-[#161b22]/80"
          }`}
        >
          {/* Card Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs font-bold text-[#c4f542] tracking-wider uppercase bg-[#c4f542]/10 px-2.5 py-1 rounded border border-[#c4f542]/20">
                01. TRIGGER
              </span>
              <span className="text-xs font-mono text-slate-400">
                {trigger.type}
              </span>
            </div>
            {trigger.isConfigured ? (
              <span className="flex items-center gap-1.5 text-xs text-[#c4f542] bg-[#c4f542]/10 px-2 py-0.5 rounded-full font-mono">
                <span className="w-2 h-2 rounded-full bg-[#c4f542] animate-pulse" />
                Configured
              </span>
            ) : (
              <span className="text-xs text-amber-400/90 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                Setup Required
              </span>
            )}
          </div>

          {/* Card Body */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-[#c4f542] shrink-0 group-hover:scale-105 transition-transform">
              {getStepIcon(trigger.type)}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-white truncate">
                {trigger.type === "WEBHOOK" ? "Catch Webhook Event" : "Poll External API"}
              </h2>
              <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                {getTriggerSummary()}
              </p>
            </div>
          </div>
        </div>

        {/* ── Connector Line + Add Step Button (After Trigger) ── */}
        <ConnectorLine
          onAddStep={() => setStepSelectorIndex(0)}
          isOpenSelector={stepSelectorIndex === 0}
          onCloseSelector={() => setStepSelectorIndex(null)}
          onSelectType={(type) => addStep(type, 0)}
        />

        {/* ── Numbered Action / Step Cards ── */}
        {steps.map((step, idx) => {
          const stepNumber = String(idx + 2).padStart(2, "0");
          return (
            <div key={step.id} className="w-full flex flex-col items-center">
              <div
                onClick={() => openStepPanel(step)}
                className={`w-full rounded-xl p-5 cursor-pointer transition-all duration-200 relative group shadow-lg ${
                  step.isConfigured
                    ? "bg-[#161b22] border-2 border-[#c4f542]/60 hover:border-[#c4f542] shadow-[0_0_20px_rgba(196,245,66,0.06)]"
                    : "bg-[#161b22]/60 border-2 border-dashed border-slate-700 hover:border-slate-500 hover:bg-[#161b22]/80"
                }`}
              >
                {/* Remove 'x' button */}
                <button
                  onClick={(e) => removeStep(step.id, e)}
                  title="Remove step"
                  className="absolute top-4 right-4 text-slate-500 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors z-10"
                >
                  <XIcon className="w-4 h-4" />
                </button>

                {/* Card Header */}
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="font-mono text-xs font-bold text-[#c4f542] tracking-wider uppercase bg-[#c4f542]/10 px-2.5 py-1 rounded border border-[#c4f542]/20">
                    {stepNumber}. {step.type}
                  </span>
                  {step.isConfigured ? (
                    <span className="flex items-center gap-1 text-xs text-[#c4f542] font-mono">
                      <CheckIcon className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 font-mono">
                      Unconfigured
                    </span>
                  )}
                </div>

                {/* Card Body */}
                <div className="flex items-center gap-3 pr-8">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-[#c4f542] shrink-0 group-hover:scale-105 transition-transform">
                    {getStepIcon(step.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-white truncate">
                      {step.name || `${step.type} Step`}
                    </h2>
                    <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                      {getStepSummary(step)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Connector Line + Add Step Button (After Step idx) */}
              <ConnectorLine
                onAddStep={() => setStepSelectorIndex(idx + 1)}
                isOpenSelector={stepSelectorIndex === idx + 1}
                onCloseSelector={() => setStepSelectorIndex(null)}
                onSelectType={(type) => addStep(type, idx + 1)}
              />
            </div>
          );
        })}
      </main>

      {/* ── Slide-in Side Panel Drawer ── */}
      {activePanel && panelDraft && (
        <>
          {/* Backdrop overlay */}
          <div
            onClick={closePanel}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 animate-fadeIn"
          />

          {/* Drawer Container */}
          <aside className="fixed inset-y-0 right-0 w-[450px] max-w-full bg-[#161b22] border-l border-slate-800 shadow-2xl z-50 flex flex-col animate-slideLeft transition-all">
            
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-[#1c2333]/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#c4f542]/10 border border-[#c4f542]/30 flex items-center justify-center text-[#c4f542]">
                  {getStepIcon(panelDraft.type)}
                </div>
                <div>
                  <div className="text-xs font-mono text-[#c4f542] uppercase tracking-wider">
                    {activePanel.target === "trigger" ? "TRIGGER SETUP" : `${panelDraft.type} STEP`}
                  </div>
                  <h3 className="text-lg font-semibold text-white">
                    {activePanel.target === "trigger"
                      ? "Configure Trigger"
                      : panelDraft.name || `${panelDraft.type} Step`}
                  </h3>
                </div>
              </div>
              <button
                onClick={closePanel}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs Header */}
            <div className="flex border-b border-slate-800 bg-[#161b22] px-6">
              <button
                onClick={() => setActivePanel({ ...activePanel, tab: "setup" })}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  activePanel.tab === "setup"
                    ? "border-[#c4f542] text-[#c4f542]"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Setup
              </button>
              <button
                onClick={() => setActivePanel({ ...activePanel, tab: "test" })}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  activePanel.tab === "test"
                    ? "border-[#c4f542] text-[#c4f542]"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Test
              </button>
            </div>

            {/* Error Banner in Side Panel */}
            {publishError && (
              <div className="m-4 p-3 bg-red-950/80 border border-red-700 rounded-lg text-xs text-red-200">
                <span className="font-semibold">Error:</span> {publishError}
              </div>
            )}

            {/* Tab Body Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activePanel.tab === "test" ? (
                /* ── Test Tab Placeholder ── */
                <div className="text-center py-12 px-4 bg-slate-900/50 border border-slate-800 rounded-xl">
                  <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
                    <ZapIcon className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-medium text-slate-200 mb-1">Test after saving</h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    You can execute and test this step live once you save and publish your Zap.
                  </p>
                </div>
              ) : (
                /* ── Setup Tab Forms ── */
                <div className="space-y-5">
                  {/* TRIGGER FORM */}
                  {activePanel.target === "trigger" && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Trigger Type
                        </label>
                        <select
                          value={panelDraft.type}
                          onChange={(e) =>
                            setPanelDraft({ ...panelDraft, type: e.target.value })
                          }
                          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:border-[#c4f542] focus:ring-1 focus:ring-[#c4f542] outline-none"
                        >
                          <option value="WEBHOOK">Webhook (Catch incoming requests)</option>
                          <option value="POLLING">Polling (Fetch external URL repeatedly)</option>
                        </select>
                      </div>

                      {panelDraft.type === "POLLING" && (
                        <>
                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1.5">
                              Polling URL
                            </label>
                            <input
                              type="url"
                              placeholder="https://api.example.com/items"
                              value={panelDraft.config?.url || ""}
                              onChange={(e) =>
                                setPanelDraft({
                                  ...panelDraft,
                                  config: { ...panelDraft.config, url: e.target.value },
                                })
                              }
                              className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:border-[#c4f542] focus:ring-1 focus:ring-[#c4f542] outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1.5">
                              Poll Interval (seconds)
                            </label>
                            <input
                              type="number"
                              min="5"
                              placeholder="60"
                              value={panelDraft.pollIntervalSec || 60}
                              onChange={(e) =>
                                setPanelDraft({
                                  ...panelDraft,
                                  pollIntervalSec: e.target.value,
                                })
                              }
                              className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono focus:border-[#c4f542] focus:ring-1 focus:ring-[#c4f542] outline-none"
                            />
                          </div>
                        </>
                      )}

                      {panelDraft.type === "WEBHOOK" && (
                        <div className="p-4 bg-slate-900/60 rounded-lg border border-slate-800 text-xs text-slate-400 space-y-1 font-mono">
                          <p className="text-slate-300 font-semibold">Webhook Endpoint:</p>
                          <p>Will be generated automatically upon publishing this Zap.</p>
                        </div>
                      )}

                      <div className="pt-3 border-t border-slate-800">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-medium text-slate-300">
                            Sample Trigger Data
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setSuccessToast("Sample trigger data reloaded!");
                              setTimeout(() => setSuccessToast(null), 3000);
                            }}
                            className="text-[11px] font-mono text-[#c4f542] hover:underline cursor-pointer"
                          >
                            ⚡ Test Trigger / Fetch Sample
                          </button>
                        </div>
                        <pre className="p-3 bg-[#0d1117] border border-slate-800 rounded-lg text-[11px] font-mono text-slate-300 max-h-36 overflow-y-auto">
                          {JSON.stringify(sampleData, null, 2)}
                        </pre>
                      </div>
                    </>
                  )}

                  {/* ACTION FORM */}
                  {activePanel.target === "step" && panelDraft.type === "ACTION" && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Step Name
                        </label>
                        <input
                          type="text"
                          value={panelDraft.name || ""}
                          onChange={(e) =>
                            setPanelDraft({ ...panelDraft, name: e.target.value })
                          }
                          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:border-[#c4f542] outline-none"
                        />
                      </div>

                      <ActionIntegrationSelector
                        config={panelDraft.config}
                        sampleData={sampleData}
                        steps={steps}
                        onChange={(newConfig) =>
                          setPanelDraft({
                            ...panelDraft,
                            config: newConfig,
                          })
                        }
                      />

                      {(!panelDraft.config?.provider || panelDraft.config?.provider === "custom_http") && (
                        <>
                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1.5">
                              HTTP Method
                            </label>
                            <select
                              value={panelDraft.config?.method || "POST"}
                              onChange={(e) =>
                                setPanelDraft({
                                  ...panelDraft,
                                  config: { ...panelDraft.config, method: e.target.value },
                                })
                              }
                              className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono focus:border-[#c4f542] outline-none"
                            >
                              <option value="GET">GET</option>
                              <option value="POST">POST</option>
                              <option value="PUT">PUT</option>
                              <option value="DELETE">DELETE</option>
                              <option value="PATCH">PATCH</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1.5">
                              Request URL
                            </label>
                            <input
                              type="url"
                              placeholder="https://api.example.com/webhook"
                              value={panelDraft.config?.url || ""}
                              onChange={(e) =>
                                setPanelDraft({
                                  ...panelDraft,
                                  config: { ...panelDraft.config, url: e.target.value },
                                })
                              }
                              className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:border-[#c4f542] outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1.5">
                              Body (JSON string)
                            </label>
                            <textarea
                              rows={6}
                              placeholder={'{\n  "event": "{{trigger.event}}"\n}'}
                              value={panelDraft.config?.body || ""}
                              onChange={(e) =>
                                setPanelDraft({
                                  ...panelDraft,
                                  config: { ...panelDraft.config, body: e.target.value },
                                })
                              }
                              className="w-full bg-[#0d1117] border border-slate-700 rounded-lg p-3 text-xs text-white font-mono placeholder:text-slate-600 focus:border-[#c4f542] outline-none"
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* AI FORM */}
                  {activePanel.target === "step" && panelDraft.type === "AI" && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Step Name
                        </label>
                        <input
                          type="text"
                          value={panelDraft.name || ""}
                          onChange={(e) =>
                            setPanelDraft({ ...panelDraft, name: e.target.value })
                          }
                          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:border-[#c4f542] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Prompt Template
                        </label>
                        <textarea
                          rows={6}
                          placeholder="Summarize the following support ticket: {{trigger.ticket_body}}"
                          value={panelDraft.config?.prompt || ""}
                          onChange={(e) =>
                            setPanelDraft({
                              ...panelDraft,
                              config: { ...panelDraft.config, prompt: e.target.value },
                            })
                          }
                          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg p-3 text-xs text-white font-mono placeholder:text-slate-600 focus:border-[#c4f542] outline-none"
                        />
                        <p className="text-[11px] text-slate-400 mt-1 font-mono">
                          Hint: use <code className="text-[#c4f542]">{"{{trigger.field}}"}</code> syntax to reference trigger data
                        </p>
                      </div>
                    </>
                  )}

                  {/* FILTER FORM */}
                  {activePanel.target === "step" && panelDraft.type === "FILTER" && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Step Name
                        </label>
                        <input
                          type="text"
                          value={panelDraft.name || ""}
                          onChange={(e) =>
                            setPanelDraft({ ...panelDraft, name: e.target.value })
                          }
                          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:border-[#c4f542] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Field Path
                        </label>
                        <input
                          type="text"
                          placeholder="trigger.body.status"
                          value={panelDraft.config?.path || ""}
                          onChange={(e) =>
                            setPanelDraft({
                              ...panelDraft,
                              config: { ...panelDraft.config, path: e.target.value },
                            })
                          }
                          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:border-[#c4f542] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Operator
                        </label>
                        <select
                          value={panelDraft.config?.operator || "EQUALS"}
                          onChange={(e) =>
                            setPanelDraft({
                              ...panelDraft,
                              config: { ...panelDraft.config, operator: e.target.value },
                            })
                          }
                          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono focus:border-[#c4f542] outline-none"
                        >
                          <option value="EQUALS">EQUALS</option>
                          <option value="NOT_EQUALS">NOT EQUALS</option>
                          <option value="CONTAINS">CONTAINS</option>
                          <option value="GREATER_THAN">GREATER THAN</option>
                          <option value="LESS_THAN">LESS THAN</option>
                          <option value="EXISTS">EXISTS</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-[#c9d1d9] mb-1.5">
                          Value
                        </label>
                        <input
                          type="text"
                          placeholder="active"
                          value={panelDraft.config?.value || ""}
                          onChange={(e) =>
                            setPanelDraft({
                              ...panelDraft,
                              config: { ...panelDraft.config, value: e.target.value },
                            })
                          }
                          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:border-[#c4f542] outline-none"
                        />
                      </div>
                    </>
                  )}

                  {/* DELAY FORM */}
                  {activePanel.target === "step" && panelDraft.type === "DELAY" && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Step Name
                        </label>
                        <input
                          type="text"
                          value={panelDraft.name || ""}
                          onChange={(e) =>
                            setPanelDraft({ ...panelDraft, name: e.target.value })
                          }
                          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:border-[#c4f542] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Seconds to Delay
                        </label>
                        <input
                          type="number"
                          min="1"
                          placeholder="30"
                          value={panelDraft.config?.seconds || 30}
                          onChange={(e) =>
                            setPanelDraft({
                              ...panelDraft,
                              config: { ...panelDraft.config, seconds: e.target.value },
                            })
                          }
                          className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono focus:border-[#c4f542] outline-none"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            {activePanel.tab === "setup" && (
              <div className="p-6 border-t border-slate-800 bg-[#1c2333]/30 flex items-center justify-end gap-3">
                <button
                  onClick={closePanel}
                  className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePanel}
                  className="bg-[#c4f542] hover:bg-[#b0e030] text-black font-semibold px-5 py-2 rounded-lg text-sm transition-all cursor-pointer shadow-sm"
                >
                  Save Step
                </button>
              </div>
            )}
          </aside>
        </>
      )}
    </div>
  );
}

// ── Connector Line component with Add Step button and step selection popover ──
function ConnectorLine({ onAddStep, isOpenSelector, onCloseSelector, onSelectType }) {
  return (
    <div className="relative flex flex-col items-center my-2 group">
      {/* Line Down */}
      <div className="w-0.5 h-12 bg-slate-700/80 group-hover:bg-[#c4f542]/60 transition-colors" />

      {/* Plus Button in middle of line */}
      <button
        onClick={onAddStep}
        title="Add next step"
        className="absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#161b22] border border-slate-700 text-slate-300 hover:border-[#c4f542] hover:text-[#c4f542] hover:scale-110 transition-all flex items-center justify-center shadow-lg cursor-pointer z-10"
      >
        <PlusIcon className="w-4 h-4" />
      </button>

      {/* Step Type Selector Popover */}
      {isOpenSelector && (
        <>
          <div className="fixed inset-0 z-30" onClick={onCloseSelector} />
          <div className="absolute top-full mt-2 w-64 bg-[#1c2333] border border-slate-700 rounded-xl shadow-2xl p-2 z-40 animate-fadeIn">
            <div className="text-[11px] font-mono font-bold text-slate-400 px-3 py-1.5 uppercase tracking-wider border-b border-slate-800">
              Select Step Type
            </div>
            <div className="py-1">
              <button
                onClick={() => onSelectType("ACTION")}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 text-left transition-colors cursor-pointer group"
              >
                <div className="w-7 h-7 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-[#c4f542] group-hover:border-[#c4f542]">
                  <ActionIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Action</div>
                  <div className="text-[10px] text-slate-400 font-mono">Send HTTP request</div>
                </div>
              </button>

              <button
                onClick={() => onSelectType("AI")}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 text-left transition-colors cursor-pointer group"
              >
                <div className="w-7 h-7 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-[#c4f542] group-hover:border-[#c4f542]">
                  <AIIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">AI Transform</div>
                  <div className="text-[10px] text-slate-400 font-mono">LLM prompt template</div>
                </div>
              </button>

              <button
                onClick={() => onSelectType("FILTER")}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 text-left transition-colors cursor-pointer group"
              >
                <div className="w-7 h-7 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-[#c4f542] group-hover:border-[#c4f542]">
                  <FilterIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Filter</div>
                  <div className="text-[10px] text-slate-400 font-mono">Conditional logic</div>
                </div>
              </button>

              <button
                onClick={() => onSelectType("DELAY")}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 text-left transition-colors cursor-pointer group"
              >
                <div className="w-7 h-7 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-[#c4f542] group-hover:border-[#c4f542]">
                  <DelayIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Delay</div>
                  <div className="text-[10px] text-slate-400 font-mono">Pause execution</div>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
