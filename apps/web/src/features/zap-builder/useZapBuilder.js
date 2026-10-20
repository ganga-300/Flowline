"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/api";
import { getPlaceholderSample } from "@/integrations/triggerVariables";
import { validateZapForPublish } from "@/lib/zapValidation";
import { toZapPayload, fromSavedZap } from "@/lib/zapForm";
import { buildSampleStepContext, getPreviousSteps } from "@/integrations/stepOutputs";
import { saveBuilderDraft, consumeBuilderDraft, clearBuilderDraft, applyConnectionToDraft } from "@/lib/builderDraft";
import { createStep } from "./stepTypes";

const PROVIDER_NAMES = { gmail: "Gmail", slack: "Slack", github: "GitHub" };

const initialTrigger = () => ({
  type: "WEBHOOK",
  config: { provider: "webhook", event: "catch_hook" },
  isConfigured: false,
});

/**
 * All builder state and actions. Used by /zaps/new and /zaps/[id]/edit (zapId set = editing).
 * panel: { target: "trigger" | "step", stepId?, tab: "setup" | "test" } and draft hold the
 * drawer's unsaved copy of what's being edited.
 */
export function useZapBuilder(zapId) {
  const router = useRouter();
  const [isLoadingZap, setIsLoadingZap] = useState(Boolean(zapId));
  const [zapName, setZapName] = useState("Untitled Zap");
  const [trigger, setTrigger] = useState(initialTrigger);
  const [steps, setSteps] = useState(() => [createStep("ACTION", "step-1")]);

  const [panel, setPanel] = useState(null);
  const [draft, setDraft] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Same shape as the payload the worker receives, so {{trigger.*}} paths match real runs.
  const [sampleData, setSampleData] = useState(() => getPlaceholderSample("webhook", "catch_hook"));
  const [sampleStatus, setSampleStatus] = useState(null); // { tone, message }
  const [isFetchingSample, setIsFetchingSample] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  // On load: restore the draft saved before an OAuth redirect (?connected=...), or load the Zap.
  const [restoreDone, setRestoreDone] = useState(false);
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const connected = urlParams.get("connected");
    const connectionIdParam = urlParams.get("connectionId");
    const errorParam = urlParams.get("error");
    const isOAuthReturn = Boolean((connected && connectionIdParam) || errorParam);

    // Only a return from OAuth restores a saved draft, and only into the same Zap.
    let restored = isOAuthReturn ? consumeBuilderDraft() : null;
    if (restored && (restored.editingZapId || null) !== zapId) restored = null;
    if (restored && connected && connectionIdParam) {
      restored = applyConnectionToDraft(restored, connected, connectionIdParam);
    }

    queueMicrotask(() => {
      if (restored) {
        if (restored.zapName) setZapName(restored.zapName);
        if (restored.trigger) setTrigger(restored.trigger);
        if (Array.isArray(restored.steps)) setSteps(restored.steps);
        if (restored.sampleData) setSampleData(restored.sampleData);
        if (restored.panelDraft && restored.activePanel) {
          setDraft(restored.panelDraft);
          setPanel(restored.activePanel);
        }
      }
      if (connected && connectionIdParam) {
        setNotice(`${PROVIDER_NAMES[connected] || "Account"} connected.`);
      } else if (errorParam) {
        setError(errorParam);
      }
      if (restored || !zapId) {
        setIsLoadingZap(false);
        setRestoreDone(true);
      }
    });

    if (isOAuthReturn) window.history.replaceState({}, document.title, window.location.pathname);

    if (zapId && !restored) {
      authFetch(`/zaps/${zapId}`)
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.zap) throw new Error(data.error || `Could not load this Zap (${res.status})`);
          const loaded = fromSavedZap(data.zap);
          setZapName(loaded.zapName);
          setTrigger(loaded.trigger);
          setSteps(loaded.steps);
          setSampleData(getPlaceholderSample(loaded.trigger.config?.provider, loaded.trigger.config?.event, loaded.trigger.config?.repo));
        })
        .catch((err) => setError(err instanceof TypeError ? "Can't reach the Flowline server right now." : err.message))
        .finally(() => {
          setIsLoadingZap(false);
          setRestoreDone(true);
        });
    }
  }, [zapId]);

  // Keep the in-progress Zap in sessionStorage so the full-page OAuth redirect
  // started by "Connect account" doesn't wipe it. Starts only after the restore check above.
  useEffect(() => {
    if (!restoreDone) return;
    saveBuilderDraft({ editingZapId: zapId, zapName, trigger, steps, activePanel: panel, panelDraft: draft, sampleData });
  }, [restoreDone, zapId, zapName, trigger, steps, panel, draft, sampleData]);

  // ── Drawer ──
  const openTrigger = useCallback(() => {
    setDraft({ ...trigger, config: { ...trigger.config } });
    setPanel({ target: "trigger", tab: "setup" });
    setError(null);
    setTestResult(null);
    setSampleStatus(null);
  }, [trigger]);

  const openStep = useCallback((step) => {
    setDraft({ ...step, config: { ...step.config } });
    setPanel({ target: "step", stepId: step.id, tab: "setup" });
    setError(null);
    setTestResult(null);
  }, []);

  const closePanel = useCallback(() => {
    setPanel(null);
    setDraft(null);
  }, []);

  const setTab = useCallback((tab) => setPanel((p) => (p ? { ...p, tab } : p)), []);

  /** Merge into the drawer draft: updateDraft({ name }) or updateDraft({ config: {...} }). */
  const updateDraft = useCallback((patch) => setDraft((d) => (d ? { ...d, ...patch } : d)), []);
  const updateDraftConfig = useCallback((patch) => setDraft((d) => (d ? { ...d, config: { ...d.config, ...patch } } : d)), []);

  // Apply the drawer's draft to the trigger or step it belongs to.
  const commitDraft = useCallback(() => {
    if (!draft || !panel) return { trigger, steps };
    if (panel.target === "trigger") {
      const next = { ...draft, isConfigured: true };
      setTrigger(next);
      return { trigger: next, steps };
    }
    const nextSteps = steps.map((s) => (s.id === panel.stepId ? { ...draft, isConfigured: true } : s));
    setSteps(nextSteps);
    return { trigger, steps: nextSteps };
  }, [draft, panel, trigger, steps]);

  const savePanel = useCallback(() => {
    commitDraft();
    closePanel();
  }, [commitDraft, closePanel]);

  // ── Steps ──
  const addStep = useCallback((type, index) => {
    const step = createStep(type, `step-${Date.now()}`);
    setSteps((prev) => {
      const next = [...prev];
      next.splice(index, 0, step);
      return next;
    });
    setDraft({ ...step, config: { ...step.config } });
    setPanel({ target: "step", stepId: step.id, tab: "setup" });
    setTestResult(null);
  }, []);

  const removeStep = useCallback((id) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    if (panel?.stepId === id) closePanel();
  }, [panel, closePanel]);

  // ── Testing ──
  const fetchSample = useCallback(async () => {
    setIsFetchingSample(true);
    setSampleStatus(null);
    try {
      const provider = draft?.config?.provider || "webhook";
      const res = await authFetch("/zaps/test-step/fetch-sample", {
        method: "POST",
        body: JSON.stringify({
          provider,
          event: draft?.config?.event,
          config: draft?.config || {},
          connectionId: draft?.config?.connectionId || draft?.connectionId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || "Couldn't load a sample");
      if (data.sample) {
        setSampleData(data.sample);
        setSampleStatus({ tone: "success", message: `Loaded a real record from ${PROVIDER_NAMES[provider] || provider}.` });
      }
    } catch (err) {
      setSampleStatus({ tone: "danger", message: err instanceof TypeError ? "Can't reach the Flowline server right now." : err.message });
    } finally {
      setIsFetchingSample(false);
    }
  }, [draft]);

  const testStep = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await authFetch("/zaps/test-step", {
        method: "POST",
        body: JSON.stringify({
          step: draft,
          sampleContext: {
            trigger: sampleData,
            steps: buildSampleStepContext(getPreviousSteps(steps, panel?.stepId)),
          },
        }),
      });
      const data = await res.json().catch(() => ({ status: "ERROR", error: `Server returned ${res.status}` }));
      setTestResult(data);
    } catch (err) {
      setTestResult({ status: "ERROR", error: err instanceof TypeError ? "Can't reach the Flowline server right now." : err.message, output: null });
    } finally {
      setIsTesting(false);
    }
  }, [draft, sampleData, steps, panel]);

  // ── Publish ──
  const publish = useCallback(async () => {
    setError(null);
    setIsPublishing(true);
    try {
      // An open drawer's changes are included, as if "Save step" was pressed.
      const current = commitDraft();
      const validationError = validateZapForPublish(current);
      if (validationError) throw new Error(validationError);

      const payload = toZapPayload({ zapName, trigger: current.trigger, steps: current.steps });
      const res = await authFetch(zapId ? `/zaps/${zapId}` : "/zaps", {
        method: zapId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server responded with status ${res.status}`);
      }
      clearBuilderDraft();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof TypeError ? "Can't reach the Flowline server right now." : err.message || "Couldn't save this Zap.");
    } finally {
      setIsPublishing(false);
    }
  }, [commitDraft, zapId, zapName, router]);

  return {
    zapId, isEditing: Boolean(zapId), isLoadingZap,
    zapName, setZapName, trigger, steps,
    panel, draft, openTrigger, openStep, closePanel, setTab, updateDraft, updateDraftConfig, savePanel,
    addStep, removeStep,
    sampleData, setSampleData, sampleStatus, isFetchingSample, fetchSample,
    testResult, isTesting, testStep,
    publish, isPublishing, error, setError, notice, setNotice,
  };
}
