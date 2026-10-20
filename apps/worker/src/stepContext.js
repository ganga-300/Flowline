/**
 * Step outputs in the run context.
 * Outputs are stored under the step's database id AND under `config.ref` - the id the
 * builder used when the Zap was created ("step-1", ...). The builder's variable picker
 * inserts {{steps.<ref>.output.<field>}}, because database ids don't exist until publish.
 */
function recordStepOutput(context, step, output) {
  const entry = { output };
  context.steps[step.id] = entry;
  const ref = step.config && step.config.ref;
  if (ref && ref !== step.id) {
    context.steps[ref] = entry;
  }
}

/** Rebuilds step outputs from earlier executions (used when a run resumes after a Delay). */
function restoreStepOutputs(context, executions, allSteps) {
  const byId = new Map(allSteps.map((s) => [s.id, s]));
  for (const execution of executions) {
    const step = byId.get(execution.stepId) || { id: execution.stepId, config: {} };
    recordStepOutput(context, step, execution.output);
  }
}

module.exports = { recordStepOutput, restoreStepOutputs };
