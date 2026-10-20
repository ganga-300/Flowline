// Keeps the Zap builder's in-progress draft across the full-page OAuth redirect
// (builder -> provider consent screen -> server callback -> back to /zaps/new).
// The pure helpers are exported separately so they can be unit-tested without a browser.

export const BUILDER_DRAFT_KEY = "flowline_builder_draft";
// OAuth state tokens expire after 15 minutes; a draft older than this is stale.
export const BUILDER_DRAFT_MAX_AGE_MS = 30 * 60 * 1000;

export function serializeDraft(draft, now = Date.now()) {
  return JSON.stringify({ savedAt: now, draft });
}

export function parseDraft(raw, now = Date.now(), maxAgeMs = BUILDER_DRAFT_MAX_AGE_MS) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.draft) return null;
    if (typeof parsed.savedAt !== "number" || now - parsed.savedAt > maxAgeMs) return null;
    return parsed.draft;
  } catch {
    return null;
  }
}

function withConnection(item, connectionId, { onlyIfMissing }) {
  if (!item || !item.config) return item;
  if (onlyIfMissing && (item.config.connectionId || item.connectionId)) return item;
  const next = { ...item, config: { ...item.config, connectionId } };
  // Trigger panels keep the id at the top level as well as inside config.
  if ("connectionId" in item) next.connectionId = connectionId;
  return next;
}

// Attaches a freshly connected account to the parts of the draft that use that provider.
// The panel that was open (the one whose "Connect" button was clicked) always gets it;
// other steps/trigger only get it if they have no account selected yet.
export function applyConnectionToDraft(draft, provider, connectionId) {
  if (!draft || !provider || !connectionId) return draft;
  const usesProvider = (item) => item?.config?.provider === provider;

  return {
    ...draft,
    trigger: usesProvider(draft.trigger)
      ? withConnection(draft.trigger, connectionId, { onlyIfMissing: true })
      : draft.trigger,
    steps: Array.isArray(draft.steps)
      ? draft.steps.map((s) => (usesProvider(s) ? withConnection(s, connectionId, { onlyIfMissing: true }) : s))
      : draft.steps,
    panelDraft: usesProvider(draft.panelDraft)
      ? withConnection(draft.panelDraft, connectionId, { onlyIfMissing: false })
      : draft.panelDraft,
  };
}

// ── Browser wrappers (sessionStorage can be unavailable or throw, e.g. in private mode) ──

export function saveBuilderDraft(draft) {
  try {
    window.sessionStorage.setItem(BUILDER_DRAFT_KEY, serializeDraft(draft));
  } catch {
    // Non-fatal: the builder still works, the draft just won't survive a redirect.
  }
}

export function consumeBuilderDraft() {
  try {
    const raw = window.sessionStorage.getItem(BUILDER_DRAFT_KEY);
    window.sessionStorage.removeItem(BUILDER_DRAFT_KEY);
    return parseDraft(raw);
  } catch {
    return null;
  }
}

export function clearBuilderDraft() {
  try {
    window.sessionStorage.removeItem(BUILDER_DRAFT_KEY);
  } catch {
    // ignore
  }
}
