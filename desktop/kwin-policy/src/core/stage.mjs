// Stage Manager grouping model (PRD §14). Stages are named window groups; one
// stage is active on the canvas, the rest live in the rail. Pure and immutable.

/** @typedef {{stages: {id: number, name: string, windowIds: string[]}[], activeId: number | null, nextId: number}} StageState */

/** @returns {StageState} */
export function createStageState() {
  return { stages: [], activeId: null, nextId: 1 };
}

/** Create a stage; the first stage created becomes active. */
export function createStage(state, name = "") {
  const stage = { id: state.nextId, name, windowIds: [] };
  return {
    stages: [...state.stages, stage],
    activeId: state.activeId ?? stage.id,
    nextId: state.nextId + 1,
  };
}

export function renameStage(state, stageId, name) {
  return {
    ...state,
    stages: state.stages.map((s) => (s.id === stageId ? { ...s, name } : s)),
  };
}

/** Assign a window to a stage, removing it from any other stage (membership is exclusive). */
export function assignWindow(state, windowId, stageId) {
  if (!state.stages.some((s) => s.id === stageId)) throw new Error(`no such stage: ${stageId}`);
  return {
    ...state,
    stages: state.stages.map((s) => {
      const without = s.windowIds.filter((id) => id !== windowId);
      return s.id === stageId ? { ...s, windowIds: [...without, windowId] } : { ...s, windowIds: without };
    }),
  };
}

export function ungroupWindow(state, windowId) {
  return {
    ...state,
    stages: state.stages.map((s) => ({ ...s, windowIds: s.windowIds.filter((id) => id !== windowId) })),
  };
}

export function stageOf(state, windowId) {
  return state.stages.find((s) => s.windowIds.includes(windowId)) ?? null;
}

/** Merge one stage's windows into another; the source stage is removed. */
export function mergeStages(state, fromId, intoId) {
  const from = state.stages.find((s) => s.id === fromId);
  const into = state.stages.find((s) => s.id === intoId);
  if (!from || !into || fromId === intoId) return state;
  return {
    ...state,
    stages: state.stages
      .filter((s) => s.id !== fromId)
      .map((s) => (s.id === intoId ? { ...s, windowIds: [...s.windowIds, ...from.windowIds] } : s)),
    activeId: state.activeId === fromId ? intoId : state.activeId,
  };
}

/**
 * Switch the active stage. Returns the new state plus the window ids to show
 * (incoming stage) and hide (outgoing stage) so the adapter can drive KWin and
 * the effect layer can animate the transition (PRD §15).
 */
export function switchStage(state, stageId) {
  const incoming = state.stages.find((s) => s.id === stageId);
  if (!incoming) throw new Error(`no such stage: ${stageId}`);
  const outgoing = state.stages.find((s) => s.id === state.activeId);
  return {
    state: { ...state, activeId: stageId },
    show: incoming.windowIds.slice(),
    hide: outgoing && outgoing.id !== stageId ? outgoing.windowIds.slice() : [],
  };
}
