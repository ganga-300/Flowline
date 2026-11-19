/**
 * Whether the worker should (still) run a run. Pure, so it's unit-tested.
 * CANCELLED: the Flow was turned off before the run started, or while it waited on a Delay.
 */
const FINISHED_RUN_STATUSES = ["SUCCESS", "FAILED", "FILTERED", "CANCELLED"];

/** True when the run's Flow is gone or turned off: the run is cancelled instead of executed. */
function shouldCancelRun(zap) {
  return !zap || zap.status !== "ENABLED";
}

module.exports = { FINISHED_RUN_STATUSES, shouldCancelRun };
