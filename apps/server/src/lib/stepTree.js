const { Prisma } = require("@prisma/client");

/**
 * Zaps are saved as a flat list of steps. Nested steps (the steps of a Path, a Loop's body)
 * name their parent with `parentRef`: the parent's `config.ref`, the id the builder gave it,
 * because a step being created has no database id yet. Path conditions travel as
 * `branchCondition` on the first step of each path (null = the "Otherwise" path).
 */

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Checks the parent links and orders the steps so every parent comes before its children.
 * Returns { error } or { ordered }.
 */
function planStepTree(steps) {
  if (!Array.isArray(steps)) return { ordered: [] };
  const refs = new Set();
  for (const step of steps) {
    if (!isPlainObject(step)) return { error: "Each step must be an object." };
    const ref = step.config?.ref;
    if (ref !== undefined) {
      if (typeof ref !== "string" || !ref) return { error: "A step's ref must be text." };
      if (refs.has(ref)) return { error: `Two steps use the same ref "${ref}".` };
      refs.add(ref);
    }
    if (step.branchCondition !== undefined && step.branchCondition !== null && !isPlainObject(step.branchCondition)) {
      return { error: "A path condition must be an object." };
    }
  }
  for (const step of steps) {
    if (step.parentRef !== undefined && step.parentRef !== null && !refs.has(step.parentRef)) {
      return { error: `A step is nested under "${step.parentRef}", which isn't in this Zap.` };
    }
  }

  // Parents first: repeatedly take the steps whose parent is already placed.
  const ordered = [];
  const placed = new Set();
  let pending = steps;
  while (pending.length > 0) {
    const ready = pending.filter((s) => !s.parentRef || placed.has(s.parentRef));
    if (ready.length === 0) return { error: "Steps can't be nested inside themselves." };
    for (const s of ready) {
      ordered.push(s);
      if (s.config?.ref) placed.add(s.config.ref);
    }
    pending = pending.filter((s) => !ready.includes(s));
  }
  return { ordered };
}

/**
 * Creates or updates each step (in planStepTree order) and links children to their parents.
 * existingIds: ids of this Zap's saved steps; a step with one of them is updated in place,
 * which keeps its run history. Returns the ids of every saved step.
 */
async function saveStepTree(tx, zapId, ordered, existingIds = new Set()) {
  const idByRef = new Map();
  const savedIds = [];
  for (const step of ordered) {
    const data = {
      type: step.type,
      name: step.name || `${step.type} Step`,
      config: step.config || {},
      order: Number.isInteger(step.order) ? step.order : 0,
      connectionId: step.connectionId || step.config?.connectionId || null,
      parentStepId: step.parentRef ? idByRef.get(step.parentRef) : null,
      // Prisma needs DbNull (not null) to store "no condition" in a Json column.
      branchCondition: step.branchCondition ?? Prisma.DbNull,
    };
    let id;
    if (step.id && existingIds.has(step.id)) {
      await tx.step.update({ where: { id: step.id }, data });
      id = step.id;
    } else {
      id = (await tx.step.create({ data: { zapId, ...data } })).id;
    }
    savedIds.push(id);
    if (step.config?.ref) idByRef.set(step.config.ref, id);
  }
  return savedIds;
}

module.exports = { planStepTree, saveStepTree };
