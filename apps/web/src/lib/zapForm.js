// Converts between the builder's state and the API's Zap shape.
//   toZapPayload  - builder state -> body for POST /zaps (create) or PUT /zaps/:id (edit)
//   fromSavedZap  - zap from GET /zaps/:id -> builder state (for editing)
// Builder step ids ("step-1", ...) are saved as config.ref because later steps reference
// them in {{steps.<ref>.output.*}}; steps loaded for editing keep their database id as dbId.

function stepConfigForApi(s) {
  const config = s.config || {};
  if (s.type === "ACTION") {
    if (config.provider) {
      return { provider: config.provider, action: config.action || "", ...config };
    }
    let parsedBody = config.body;
    if (typeof config.body === "string" && config.body.trim().startsWith("{")) {
      try {
        parsedBody = JSON.parse(config.body);
      } catch {
        parsedBody = config.body;
      }
    }
    return { url: config.url || "", method: config.method || "POST", body: parsedBody || {} };
  }
  if (s.type === "AI") return { prompt: config.prompt || "" };
  if (s.type === "FILTER") {
    return { condition: { path: config.path || "", operator: config.operator || "EQUALS", value: config.value || "" } };
  }
  if (s.type === "DELAY") return { seconds: Number(config.seconds) || 0 };
  // Step types the builder can't edit (e.g. created via the API) are passed through as-is.
  const { ref, ...rest } = config;
  return rest;
}

export function toZapPayload({ zapName, trigger, steps }) {
  const triggerConnectionId = trigger.connectionId || trigger.config?.connectionId;
  return {
    name: (zapName || "").trim() || "Untitled Zap",
    status: "ENABLED",
    trigger: {
      type: trigger.type,
      config: trigger.config || {},
      ...(trigger.type === "POLLING" && { pollIntervalSec: Number(trigger.pollIntervalSec) || 300 }),
      ...(triggerConnectionId && { connectionId: triggerConnectionId }),
    },
    steps: steps.map((s, idx) => ({
      ...(s.dbId && { id: s.dbId }),
      type: s.type,
      name: s.name || `${s.type} Step`,
      order: idx,
      ...(s.config?.connectionId && { connectionId: s.config.connectionId }),
      config: { ...stepConfigForApi(s), ref: s.id },
    })),
  };
}

function stepConfigForBuilder(step) {
  const { ref, ...config } = step.config || {};
  if (step.type === "ACTION") {
    if (config.provider) {
      return { ...config, connectionId: config.connectionId || step.connectionId || null };
    }
    return {
      url: config.url || "",
      method: config.method || "POST",
      body: config.body && typeof config.body === "object" ? JSON.stringify(config.body, null, 2) : config.body || "",
    };
  }
  if (step.type === "FILTER") {
    const c = config.condition || {};
    return { path: c.path || "", operator: c.operator || "EQUALS", value: c.value ?? "" };
  }
  if (step.type === "AI") return { prompt: config.prompt || config.promptTemplate || "" };
  if (step.type === "DELAY") return { seconds: config.seconds ?? 30 };
  return config;
}

export function fromSavedZap(zap) {
  const t = zap.trigger || { type: "WEBHOOK", config: { provider: "webhook", event: "catch_hook" } };
  const steps = (zap.steps || [])
    .filter((s) => !s.parentStepId)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      id: s.config?.ref || s.id,
      dbId: s.id,
      type: s.type,
      name: s.name,
      config: stepConfigForBuilder(s),
      isConfigured: true,
    }));
  return {
    zapName: zap.zapName || "Untitled Zap",
    trigger: {
      type: t.type,
      config: { ...(t.config || {}) },
      ...(t.connectionId && { connectionId: t.connectionId }),
      ...(t.pollIntervalSec && { pollIntervalSec: t.pollIntervalSec }),
      isConfigured: true,
    },
    steps,
  };
}
