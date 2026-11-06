// The builder's steps as a tree (pure functions, no React).
//
//   step = { id, type, name, config, isConfigured, dbId? }
//   Paths (type BRANCH): step.paths = [{ id, name, condition: { path, operator, value } | null, steps: [...] }]
//                        condition null = the "Otherwise" path (runs when no other path matches)
//   Loop  (type LOOP):   step.steps = [...]   (run once per item of config.arrayPath)
//
// A list of steps is addressed by its owner ("where"):
//   { kind: "root" } | { kind: "path", stepId, pathId } | { kind: "loop", stepId }
//
// The API stores a flat list (see toPayloadSteps): each nested step names its parent with
// parentRef. The first step of a path carries the path's condition (branchCondition) and is
// the parent of the rest of that path, which is how the worker runs a path.

export const ROOT = { kind: "root" };
export const CONTAINER_TYPES = new Set(["BRANCH", "LOOP"]);

const OTHERWISE = "Otherwise";

const childrenOf = (step) => (step.type === "LOOP" ? step.steps || [] : []);

function sameWhere(a, b) {
  return a.kind === b.kind && (a.kind === "root" || (a.stepId === b.stepId && a.pathId === b.pathId));
}

/** Calls visit(step, { where, index, depth, inLoop }) for every step, in run order. */
export function walkSteps(steps, visit, where = ROOT, depth = 0, inLoop = false) {
  steps.forEach((step, index) => {
    visit(step, { where, index, depth, inLoop });
    if (step.type === "BRANCH") {
      for (const path of step.paths || []) {
        walkSteps(path.steps || [], visit, { kind: "path", stepId: step.id, pathId: path.id }, depth + 1, inLoop);
      }
    } else if (step.type === "LOOP") {
      walkSteps(childrenOf(step), visit, { kind: "loop", stepId: step.id }, depth + 1, true);
    }
  });
}

/** { step, where, index, inLoop } for a step id, or null. */
export function findStep(steps, id) {
  let found = null;
  walkSteps(steps, (step, info) => {
    if (!found && step.id === id) found = { step, ...info };
  });
  return found;
}

/** Every step in run order (containers before their contents). */
export function flattenSteps(steps) {
  const all = [];
  walkSteps(steps, (step) => all.push(step));
  return all;
}

/** Applies fn to the list owned by `where`; returns a new tree. */
export function updateList(steps, where, fn) {
  if (where.kind === "root") return fn(steps);
  return steps.map((step) => {
    if (step.id === where.stepId) {
      if (where.kind === "loop") return { ...step, steps: fn(step.steps || []) };
      return { ...step, paths: (step.paths || []).map((p) => (p.id === where.pathId ? { ...p, steps: fn(p.steps || []) } : p)) };
    }
    if (step.type === "BRANCH") {
      return { ...step, paths: (step.paths || []).map((p) => ({ ...p, steps: updateList(p.steps || [], where, fn) })) };
    }
    if (step.type === "LOOP") return { ...step, steps: updateList(step.steps || [], where, fn) };
    return step;
  });
}

/** Replaces one step (anywhere) with fn(step); returns a new tree. */
export function updateStep(steps, id, fn) {
  const found = findStep(steps, id);
  if (!found) return steps;
  return updateList(steps, found.where, (list) => list.map((s) => (s.id === id ? fn(s) : s)));
}

export function insertStep(steps, where, index, step) {
  return updateList(steps, where, (list) => {
    const next = [...list];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, step);
    return next;
  });
}

export function removeStep(steps, id) {
  const found = findStep(steps, id);
  if (!found) return steps;
  return updateList(steps, found.where, (list) => list.filter((s) => s.id !== id));
}

/** Moves a step up (-1) or down (+1) among its siblings. */
export function moveStep(steps, id, delta) {
  const found = findStep(steps, id);
  if (!found) return steps;
  return updateList(steps, found.where, (list) => {
    const to = found.index + delta;
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    const [moved] = next.splice(found.index, 1);
    next.splice(to, 0, moved);
    return next;
  });
}

/** True when the step can move that way within its list. */
export function canMove(steps, id, delta) {
  const found = findStep(steps, id);
  if (!found) return false;
  let length = 0;
  updateList(steps, found.where, (list) => {
    length = list.length;
    return list;
  });
  const to = found.index + delta;
  return to >= 0 && to < length;
}

/** Deep copy with new ids (makeId()) for the step and everything inside it; not yet saved. */
export function cloneStep(step, makeId) {
  const copy = { ...step, id: makeId(), config: { ...step.config }, isConfigured: step.isConfigured };
  delete copy.dbId;
  if (step.type === "BRANCH") {
    copy.paths = (step.paths || []).map((p) => ({ ...p, id: makeId(), steps: (p.steps || []).map((s) => cloneStep(s, makeId)) }));
  }
  if (step.type === "LOOP") copy.steps = (step.steps || []).map((s) => cloneStep(s, makeId));
  return copy;
}

/** Inserts a copy right after the original; returns { steps, copy }. */
export function duplicateStep(steps, id, makeId) {
  const found = findStep(steps, id);
  if (!found) return { steps, copy: null };
  const copy = { ...cloneStep(found.step, makeId), name: found.step.name ? `${found.step.name} (copy)` : found.step.name };
  return { steps: insertStep(steps, found.where, found.index + 1, copy), copy };
}

/**
 * Steps that have run before `id` (their outputs can be used by it), in run order: earlier
 * siblings at each level, plus the Paths/Loop step the list belongs to.
 */
export function stepsBefore(steps, id) {
  const before = [];
  const search = (list) => {
    for (const step of list) {
      if (step.id === id) return true;
      before.push(step);
      if (step.type === "BRANCH") {
        for (const path of step.paths || []) {
          const mark = before.length;
          if (search(path.steps || [])) return true;
          before.length = mark; // other paths don't run before this one
        }
      } else if (step.type === "LOOP") {
        const mark = before.length;
        if (search(step.steps || [])) return true;
        before.length = mark;
      }
    }
    return false;
  };
  return search(steps) ? before : flattenSteps(steps);
}

/** Id of the innermost Loop that `id` is inside, or null. */
export function enclosingLoopId(steps, id) {
  let result = null;
  const search = (list, loopId) => {
    for (const step of list) {
      if (step.id === id) {
        result = loopId;
        return true;
      }
      if (step.type === "BRANCH" && (step.paths || []).some((p) => search(p.steps || [], loopId))) return true;
      if (step.type === "LOOP" && search(step.steps || [], step.id)) return true;
    }
    return false;
  };
  search(steps, null);
  return result;
}

/** Follows a dot path ("trigger.items.0") into an object; undefined if any part is missing. */
export function resolvePath(obj, path) {
  if (!path) return undefined;
  return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), obj);
}

/** The run-order number shown on each card: trigger is 1, then 2, 3... through nested steps. */
export function stepNumbers(steps) {
  const numbers = new Map();
  let n = 1;
  walkSteps(steps, (step) => numbers.set(step.id, ++n));
  return numbers;
}

/** Where a new step may go: Delay only at the top level; a path can't start with Paths/Loop. */
export function allowedKinds(where, index) {
  return (type) => {
    if (where.kind !== "root" && type === "DELAY") return false;
    if (where.kind === "path" && index === 0 && CONTAINER_TYPES.has(type)) return false;
    return true;
  };
}

export const otherwiseName = OTHERWISE;

/**
 * Problems that would stop the Zap from running as drawn. Returns a user-facing message or
 * null. stepLabel(step) names a step in messages.
 */
export function treeProblem(steps, stepLabel = (s) => s.name || "a step") {
  let problem = null;
  walkSteps(steps, (step, { where, index }) => {
    if (problem) return;
    if (where.kind !== "root" && step.type === "DELAY") {
      problem = `${stepLabel(step)}: a Delay can't be inside Paths or a Loop. Move it to the main list of steps.`;
    } else if (where.kind === "path" && index === 0 && CONTAINER_TYPES.has(step.type)) {
      problem = `${stepLabel(step)}: a path can't start with ${step.type === "LOOP" ? "a Loop" : "Paths"}. Add another step before it.`;
    } else if (step.type === "BRANCH") {
      const paths = step.paths || [];
      if (!paths.some((p) => p.condition)) problem = `${stepLabel(step)}: add at least one path with a rule.`;
      for (const path of paths) {
        if (problem) break;
        if (path.condition && !path.condition.path) problem = `${stepLabel(step)}: "${path.name}" needs a rule (choose a field).`;
        else if (!(path.steps || []).length) problem = `${stepLabel(step)}: "${path.name}" needs at least one step.`;
      }
    } else if (step.type === "LOOP") {
      if (!step.config?.arrayPath) problem = `${stepLabel(step)}: choose the list of items to loop over.`;
      else if (!(step.steps || []).length) problem = `${stepLabel(step)}: add a step to run for each item.`;
    }
  });
  return problem;
}

/**
 * Flat API list: [{ step, parentRef, branchCondition, order }] in run order. The API turns
 * parentRef (the parent's builder id, saved as config.ref) into the parent's database id.
 */
export function toPayloadSteps(steps) {
  const out = [];
  const addList = (list, parentRef) => {
    list.forEach((step, order) => {
      out.push({ step, parentRef, branchCondition: undefined, order });
      addChildren(step);
    });
  };
  const addChildren = (step) => {
    if (step.type === "LOOP") addList(step.steps || [], step.id);
    if (step.type !== "BRANCH") return;
    (step.paths || []).forEach((path, order) => {
      const [head, ...rest] = path.steps || [];
      if (!head) return;
      const condition = path.condition ? { ...path.condition, name: path.name } : null;
      out.push({ step: head, parentRef: step.id, branchCondition: condition, order });
      addChildren(head);
      addList(rest, head.id);
    });
  };
  addList(steps, null);
  return out;
}

/**
 * Rebuilds the tree from saved steps (GET /zaps/:id): toBuilderStep(saved) makes a builder
 * step; saved parentStepId links become nesting. Steps chained under a path's first step
 * (or under any plain step) are listed after it, which is the order the worker runs them.
 */
export function fromSavedSteps(saved, toBuilderStep) {
  const byParent = new Map();
  for (const s of saved) {
    const key = s.parentStepId || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(s);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);
  const kids = (s) => byParent.get(s.id) || [];

  // A plain step's children run right after it: list them as following siblings.
  const chain = (s) => {
    const own = build(s);
    if (CONTAINER_TYPES.has(s.type)) return [own];
    return [own, ...kids(s).flatMap(chain)];
  };
  const build = (s) => {
    const step = toBuilderStep(s);
    if (s.type === "LOOP") step.steps = kids(s).flatMap(chain);
    if (s.type === "BRANCH") {
      step.paths = kids(s).map((head, i) => ({
        id: `path-${head.id}`,
        name: head.branchCondition ? head.branchCondition.name || `Path ${String.fromCharCode(65 + i)}` : OTHERWISE,
        condition: head.branchCondition ? { path: head.branchCondition.path || "", operator: head.branchCondition.operator || "EQUALS", value: head.branchCondition.value ?? "" } : null,
        steps: chain(head),
      }));
    }
    return step;
  };
  return (byParent.get(null) || []).flatMap(chain);
}

/** A new path: named Path A, B, C... after the ones that exist. */
export function newPath(existingPaths, makeId) {
  const used = new Set(existingPaths.map((p) => p.name));
  let i = 0;
  while (used.has(`Path ${String.fromCharCode(65 + i)}`)) i++;
  return { id: makeId(), name: `Path ${String.fromCharCode(65 + i)}`, condition: { path: "", operator: "EQUALS", value: "" }, steps: [] };
}

export { sameWhere };
