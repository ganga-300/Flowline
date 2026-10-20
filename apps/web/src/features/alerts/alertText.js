// Pure helpers for failure alerts. The worker writes messages as
// `Zap "<name>" failed during execution: <reason>` (apps/worker/src/index.js).

const PREFIX = /^Zap ".*" failed during execution:\s*/s;

/** The useful part of the message: why the run failed. */
export function alertReason(alert) {
  const message = alert?.message || "";
  const reason = message.replace(PREFIX, "").trim();
  return reason || message || "The run failed.";
}

/** The run stopped because a step's outcome is unknown after a worker restart. */
export function isOutcomeUnknownAlert(alert) {
  return /outcome is unknown/i.test(alert?.message || "");
}

/** Link to the failed run, opened and highlighted on the run history page. */
export function alertRunHref(alert) {
  if (!alert?.zapId) return null;
  const base = `/zaps/${alert.zapId}/runs`;
  return alert.zapRunId ? `${base}?run=${encodeURIComponent(alert.zapRunId)}` : base;
}
