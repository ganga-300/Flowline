"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/api";
import { getPlaceholderSample } from "@/integrations/triggerVariables";
import { validateZapForPublish } from "@/lib/zapValidation";
import { toZapPayload, fromSavedZap } from "@/lib/zapForm";
import { buildSampleStepContext } from "@/integrations/stepOutputs";
import { getIntegrationAction } from "@/integrations";
import * as tree from "@/lib/stepTree";
import { saveBuilderDraft, consumeBuilderDraft, clearBuilderDraft, applyConnectionToDraft } from "@/lib/builderDraft";
import { createStep } from "./stepTypes";

const PROVIDER_NAMES = { gmail: "Gmail", slack: "Slack", github: "GitHub" };

// A new Zap starts with no trigger app picked: the user chooses, nothing is preselected.
const initialTrigger = () => ({ type: "WEBHOOK", config: {}, isConfigured: false });
const initialSteps = () => [createStep("ACTION", "step-1")];

// Ids for new steps; they become the step's ref ({{steps.<id>...}}) when the Zap is saved.
let idCounter = 0;
const newId = () => `step-${Date.now().toString(36)}${(idCounter++).toString(36)}`;

// The drawer edits a copy; Paths keep their own copy of each path's name and rule.
const copyForDraft = (step) => ({
  ...step,
  config: { ...step.config },
  ...(step.paths && { paths: step.paths.map((p) => ({ ...p, condition: p.condition && { ...p.condition } })) }),
});

/**
 * All builder state and actions. Used by /zaps/new and /zaps/[id]/edit (zapId set = editing).
 * steps is a tree (Paths, Loop): see lib/stepTree.js.
 * panel: { target: "trigger" | "step", stepId?, tab: "setup" | "test" } and draft hold the
 * drawer's unsaved copy of what's being edited.
 */
export function useZapBuilder(zapId) {
  const router = useRouter();
  const [isLoadingZap, setIsLoadingZap] = useState(Boolean(zapId));
  const [zapName, setZapName] = useState("Untitled Zap");
  const [trigger, setTrigger] = useState(initialTrigger);
  const [steps, setSteps] = useState(initialSteps);

  const [panel, setPanel] = useState(null);
  const [draft, setDraft] = useState(null);
  // The drawer's copy as it was when opened, so just opening a step isn't an unsaved change.
  const [panelOrigin, setPanelOrigin] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [askName, setAskName] = useState(false); // "Name your Zap" before the first publish
  const [published, setPublished] = useState(null); // the Zap just created (success dialog)
  const [loadError, setLoadError] = useState(null); // { notFound, message } when editing fails to load
  const [error, setErrorMessage] = useState(null);
  // "connect" when the error came back from connecting an app (OAuth), so it isn't shown as a publish failure.
  const [errorKind, setErrorKind] = useState(null);
  const setError = useCallback((message, kind = null) => {
    setErrorMessage(message);
    setErrorKind(message ? kind : null);
  }, []);
  const [notice, setNotice] = useState(null);
  // What was last loaded or published, to tell whether there are unsaved changes.
  const [baseline, setBaseline] = useState(null);
  const leavingRef = useRef(false); // set once published, so leaving doesn't warn

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
          setPanelOrigin(restored.panelOrigin ?? null);
        }
        // What was saved before the redirect, so unsaved changes are still detected (and
        // leaving still warns) after coming back from connecting an account.
        setBaseline(restored.baseline ?? (zapId ? "" : snapshot("Untitled Zap", initialTrigger(), initialSteps())));
      }
      if (connected && connectionIdParam) {
        setNotice(`${PROVIDER_NAMES[connected] || "Account"} connected.`);
      } else if (errorParam) {
        setError(errorParam, "connect");
      }
      if (restored || !zapId) {
        setIsLoadingZap(false);
        setRestoreDone(true);
        if (!restored) setBaseline(snapshot("Untitled Zap", initialTrigger(), initialSteps()));
      }
    });

    if (isOAuthReturn) window.history.replaceState({}, document.title, window.location.pathname);

    if (zapId && !restored) {
      authFetch(`/zaps/${zapId}`)
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.zap) {
            throw Object.assign(new Error(data.error || `Could not load this Zap (${res.status})`), { status: res.status });
          }
          const loaded = fromSavedZap(data.zap);
          setZapName(loaded.zapName);
          setTrigger(loaded.trigger);
          setSteps(loaded.steps);
          setSampleData(getPlaceholderSample(loaded.trigger.config?.provider, loaded.trigger.config?.event, loaded.trigger.config?.repo));
          setBaseline(snapshot(loaded.zapName, loaded.trigger, loaded.steps));
        })
        .catch((err) =>
          setLoadError({
            notFound: err.status === 404 || err.status === 400,
            message: err instanceof TypeError ? "Can't reach the Flowline server right now." : err.message,
          })
        )
        .finally(() => {
          setIsLoadingZap(false);
          setRestoreDone(true);
        });
    }
  }, [zapId, setError]);

  // Keep the in-progress Zap in sessionStorage so the full-page OAuth redirect
  // started by "Connect account" doesn't wipe it. Starts only after the restore check above.
  useEffect(() => {
    if (!restoreDone) return;
    if (published || loadError) return;
    saveBuilderDraft({ editingZapId: zapId, zapName, trigger, steps, activePanel: panel, panelDraft: draft, panelOrigin, sampleData, baseline });
  }, [restoreDone, zapId, zapName, trigger, steps, panel, draft, panelOrigin, sampleData, baseline, published, loadError]);

  // ── Drawer ──
  const openTrigger = useCallback(() => {
    const copy = { ...trigger, config: { ...trigger.config } };
    setDraft(copy);
    setPanelOrigin(JSON.stringify(copy));
    setPanel({ target: "trigger", tab: "setup" });
    setError(null);
    setTestResult(null);
    setSampleStatus(null);
  }, [trigger, setError]);

  const openStep = useCallback((step) => {
    const copy = copyForDraft(step);
    setDraft(copy);
    setPanelOrigin(JSON.stringify(copy));
    setPanel({ target: "step", stepId: step.id, tab: "setup" });
    setError(null);
    setTestResult(null);
  }, [setError]);

  const closePanel = useCallback(() => {
    setPanel(null);
    setDraft(null);
    setPanelOrigin(null);
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
    // Containers keep the steps drawn on the canvas; the drawer only edits their settings
    // (and, for Paths, each path's name and rule).
    const nextSteps = tree.updateStep(steps, panel.stepId, (current) => ({
      ...draft,
      isConfigured: true,
      ...(current.type === "LOOP" && { steps: current.steps || [] }),
      ...(draft.paths && {
        paths: draft.paths.map((p) => ({ ...p, steps: current.paths?.find((c) => c.id === p.id)?.steps || [] })),
      }),
    }));
    setSteps(nextSteps);
    return { trigger, steps: nextSteps };
  }, [draft, panel, trigger, steps]);

  const savePanel = useCallback(() => {
    commitDraft();
    closePanel();
  }, [commitDraft, closePanel]);

  // ── Steps ──
  /** Adds a step to a list (where: tree.ROOT, a path or a loop body) and opens it. */
  const addStep = useCallback((type, where, index) => {
    const step = createStep(type, newId());
    setSteps((prev) => tree.insertStep(prev, where, index, step));
    const copy = copyForDraft(step);
    setDraft(copy);
    setPanelOrigin(JSON.stringify(copy));
    setPanel({ target: "step", stepId: step.id, tab: "setup" });
    setTestResult(null);
  }, []);

  const removeStep = useCallback((id) => {
    setSteps((prev) => tree.removeStep(prev, id));
    // Close the drawer if it shows this step or something inside it.
    const open = panel?.stepId;
    if (open && (open === id || !tree.findStep(tree.removeStep(steps, id), open))) closePanel();
  }, [panel, steps, closePanel]);

  const duplicateStep = useCallback((id) => {
    setSteps((prev) => tree.duplicateStep(prev, id, newId).steps);
  }, []);

  const moveStep = useCallback((id, delta) => setSteps((prev) => tree.moveStep(prev, id, delta)), []);

  const renameStep = useCallback((id, name) => {
    setSteps((prev) => tree.updateStep(prev, id, (s) => ({ ...s, name })));
  }, []);

  /** Path edits made on the canvas: add a path, or update one (name/rule) of a Paths step. */
  const addPath = useCallback((stepId) => {
    setSteps((prev) => tree.updateStep(prev, stepId, (s) => {
      const paths = s.paths || [];
      const path = tree.newPath(paths, newId);
      // New paths go before "Otherwise", which is checked last.
      const otherwise = paths.findIndex((p) => !p.condition);
      const next = [...paths];
      next.splice(otherwise === -1 ? next.length : otherwise, 0, path);
      return { ...s, paths: next };
    }));
  }, []);

  /**
   * Steps whose data the open step can use: earlier steps, numbered as on the canvas; the
   * Loop it is inside is marked so the picker offers the current item.
   */
  const previousStepsFor = useCallback((id) => {
    const numbers = tree.stepNumbers(steps);
    const enclosingLoop = tree.enclosingLoopId(steps, id);
    return tree.stepsBefore(steps, id).map((s) => ({
      ...s,
      number: numbers.get(s.id),
      ...(s.id === enclosingLoop && { isCurrentLoop: true, loopSample: loopSampleFor(s, sampleData) }),
    }));
  }, [steps, sampleData]);

  // ── Testing ──
  const fetchSample = useCallback(async () => {
    setIsFetchingSample(true);
    setSampleStatus(null);
    try {
      const provider = draft?.config?.provider || "webhook";
      if (provider === "webhook") {
        // Webhooks: the last request this Zap actually received (only once it's published).
        if (!draft?.id) return;
        const res = await authFetch(`/zaps/test-step/sample/${draft.id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't load the last request");
        if (data.sample) {
          setSampleData(data.sample);
          const when = data.receivedAt ? new Date(data.receivedAt).toLocaleString() : null;
          setSampleStatus({ tone: "success", message: `Showing the last request this Zap received${when ? ` (${when})` : ""}.` });
        } else {
          setSampleStatus({ tone: "info", message: "No requests yet. Send a POST request with a JSON body to the webhook URL, then check again." });
        }
        return;
      }
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
      const previous = previousStepsFor(panel?.stepId);
      const loop = previous.find((s) => s.isCurrentLoop);
      const res = await authFetch("/zaps/test-step", {
        method: "POST",
        body: JSON.stringify({
          step: draft,
          sampleContext: {
            trigger: sampleData,
            steps: buildSampleStepContext(previous),
            ...(loop && { loopItem: loop.loopSample ?? null }),
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
  }, [draft, sampleData, panel, previousStepsFor]);

  // ── Publish ──
  /**
   * Checks the Zap, asks for a name the first time (when it's still "Untitled Zap"), then
   * saves it. name: the name chosen in that prompt.
   */
  const publish = useCallback(async ({ name } = {}) => {
    setError(null);
    // An open drawer's changes are included, as if "Save step" was pressed.
    const current = commitDraft();
    const validationError = validateZapForPublish(current, { getAction: getIntegrationAction });
    if (validationError) {
      setError(validationError);
      return;
    }
    const finalName = (name ?? zapName).trim();
    if (!zapId && name === undefined && (!finalName || finalName === "Untitled Zap")) {
      closePanel();
      setAskName(true);
      return;
    }
    setAskName(false);
    if (name !== undefined) setZapName(finalName);
    setIsPublishing(true);
    try {
      const payload = toZapPayload({ zapName: finalName, trigger: current.trigger, steps: current.steps });
      const res = await authFetch(zapId ? `/zaps/${zapId}` : "/zaps", {
        method: zapId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server responded with status ${res.status}`);
      clearBuilderDraft();
      setBaseline(snapshot(finalName, current.trigger, current.steps));
      leavingRef.current = true;
      closePanel();
      // A new Zap shows what happens next (its webhook URL, when it runs); edits go back.
      if (zapId || !data.zap) router.push("/dashboard");
      else setPublished(data.zap);
    } catch (err) {
      setError(err instanceof TypeError ? "Can't reach the Flowline server right now." : err.message || "Couldn't save this Zap.");
    } finally {
      setIsPublishing(false);
    }
  }, [commitDraft, closePanel, zapId, zapName, router, setError]);

  // ── Unsaved changes ──
  const isDirty = useMemo(
    () =>
      baseline !== null &&
      (snapshot(zapName, trigger, steps) !== baseline || Boolean(panel && draft && JSON.stringify(draft) !== panelOrigin)),
    [baseline, panel, draft, panelOrigin, zapName, trigger, steps]
  );
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e) => {
      if (leavingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  return {
    zapId, isEditing: Boolean(zapId), isLoadingZap, isDirty,
    zapName, setZapName, trigger, steps,
    panel, draft, openTrigger, openStep, closePanel, setTab, updateDraft, updateDraftConfig, savePanel,
    addStep, removeStep, duplicateStep, moveStep, renameStep, addPath, previousStepsFor,
    restoreSteps: setSteps, // undo a delete
    sampleData, setSampleData, sampleStatus, isFetchingSample, fetchSample,
    testResult, isTesting, testStep,
    publish, isPublishing, error, errorKind, setError, notice, setNotice,
    askName, setAskName, published, loadError,
  };
}

// Comparable text of what would be saved (ignores the drawer and test state).
function snapshot(zapName, trigger, steps) {
  return JSON.stringify({ zapName, trigger, steps });
}

/** One sample item of the Loop's list, from the trigger sample, for the picker and tests. */
function loopSampleFor(loop, sampleData) {
  const list = tree.resolvePath({ trigger: sampleData }, (loop.config?.arrayPath || "").trim());
  if (Array.isArray(list)) return list[0];
  return list;
}
