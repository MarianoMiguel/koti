// ModeController (PRD §7, §10, §16, §17) — the piece that turns four
// independent layout models into one desktop.
//
// It owns, for every (workspace × output) cell, which mode is active and the
// state that mode needs, and answers one question for the adapter: given this
// screen, where does every window go? Everything here is pure logic over plain
// data; nothing imports KWin.

import {
  MODES,
  DEFAULT_MODE,
  createModeState,
  getMode,
  setMode as setCellMode,
  rememberWindow,
  recallWindow,
  forgetWindow,
  serialize as serializeModes,
  deserialize as deserializeModes,
} from "./mode-state.mjs";
import * as floating from "./floating.mjs";
import * as tree from "./tiling-tree.mjs";
import * as tiling from "./tiling.mjs";
import * as scrolling from "./scrolling.mjs";
import * as stage from "./stage.mjs";
import * as actions from "./actions.mjs";

export { MODES, DEFAULT_MODE };
export { ACTIONS, FRACTIONAL_LAYOUTS, SPECIAL_ACTIONS } from "./actions.mjs";
export const TILING_POLICIES = tiling.POLICIES;

const DEFAULTS = {
  gap: 8,
  // Workspaces are per output and numbered from 1, the way hyprland and niri
  // number them. Nine is the reachable-by-one-keystroke range.
  workspaceCount: 9,
  scrollWidthRatio: 0.5, // PRD §13: stable widths, not shrink-to-fit
  stageRailRatio: 0.16, // PRD §14: the rail down the left edge
};

const key = (workspaceId, outputId) => `${workspaceId} ${outputId}`;

export function createController(options = {}) {
  return {
    options: Object.assign({}, DEFAULTS, options),
    modes: createModeState(),
    cells: new Map(),
    // outputId → { current } — each monitor has its own current workspace, so
    // switching workspace on the laptop panel leaves the external monitor
    // alone (hyprland and niri both behave this way; KWin's virtual desktops
    // cannot, because the current desktop is global).
    outputs: new Map(),
  };
}

// --- workspaces (per output, PRD §18) ---------------------------------------

function ensureOutput(ctl, outputId) {
  let out = ctl.outputs.get(outputId);
  if (!out) {
    out = { current: 1 };
    ctl.outputs.set(outputId, out);
  }
  return out;
}

export function currentWorkspace(ctl, outputId) {
  return ensureOutput(ctl, outputId).current;
}

/** Clamped to 1…workspaceCount, so a stray shortcut cannot strand the user. */
export function setCurrentWorkspace(ctl, outputId, index) {
  const out = ensureOutput(ctl, outputId);
  out.current = clampWorkspace(ctl, index);
  return out.current;
}

export function cycleWorkspace(ctl, outputId, delta, { wrap = true } = {}) {
  const out = ensureOutput(ctl, outputId);
  const count = ctl.options.workspaceCount;
  let next = out.current + delta;
  if (wrap) next = ((next - 1 + count) % count) + 1;
  out.current = clampWorkspace(ctl, next);
  return out.current;
}

function clampWorkspace(ctl, index) {
  const n = Math.round(index);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(ctl.options.workspaceCount, n));
}

/**
 * Move a window to another workspace on the same output, keeping everything
 * remembered about it (PRD §17). The window leaves its old cell's tree/strip/
 * stage and joins the target's, so each workspace keeps a coherent layout.
 */
export function moveWindowToWorkspace(ctl, outputId, id, index, { screen } = {}) {
  const target = clampWorkspace(ctl, index);
  const from = workspaceOf(ctl, outputId, id);
  if (from === null || from === target) return null;

  const source = ensureCell(ctl, from, outputId);
  const wasExcluded = source.excluded.has(id);
  detachFromCell(ctl, source, id);

  const destination = ensureCell(ctl, target, outputId);
  destination.order.push(id);
  destination.stacking = floating.raiseWindow(destination.stacking, id);
  destination.focusId = id;
  if (wasExcluded) destination.excluded.add(id);
  rememberWindow(ctl.modes, id, { workspace: target });
  reconcile(ctl, destination, screen);
  reconcile(ctl, source, screen);
  return target;
}

/** Which workspace on this output holds the window, or null. */
export function workspaceOf(ctl, outputId, id) {
  for (const cell of ctl.cells.values()) {
    if (cell.outputId === outputId && cell.order.includes(id)) return cell.workspaceId;
  }
  return null;
}

/**
 * What an indicator needs to draw: every workspace on this output, whether it
 * holds anything, and which one is current.
 */
export function workspaceSummary(ctl, outputId) {
  const current = currentWorkspace(ctl, outputId);
  const summary = [];
  for (let index = 1; index <= ctl.options.workspaceCount; index++) {
    const cell = ctl.cells.get(key(index, outputId));
    const windows = cell ? cell.order.filter((id) => !cell.excluded.has(id)).length : 0;
    summary.push({
      index,
      windows,
      occupied: windows > 0,
      active: index === current,
      mode: mode(ctl, index, outputId),
    });
  }
  return summary;
}

/** Outputs the controller has seen. */
export function knownOutputs(ctl) {
  return [...ctl.outputs.keys()];
}

function ensureCell(ctl, workspaceId, outputId) {
  const k = key(workspaceId, outputId);
  let cell = ctl.cells.get(k);
  if (!cell) {
    cell = {
      workspaceId,
      outputId,
      order: [], // arrival order; the spine every mode reconciles against
      excluded: new Set(), // present but not laid out — minimized, mostly
      // Tiling: which arrangement, how wide the main column, which windows the
      // user has lifted out of the tiling, and which one owns the screen.
      policy: "automatic",
      mainRatio: 0.5,
      floating: new Set(),
      fullscreenId: null,
      focusId: null,
      stacking: [], // bottom → top, floating and stage
      tree: null, // tiling
      strip: scrolling.createStrip(),
      stages: stage.createStageState(),
    };
    ctl.cells.set(k, cell);
  }
  return cell;
}

export function mode(ctl, workspaceId, outputId) {
  return getMode(ctl.modes, workspaceId, outputId);
}

// --- membership -------------------------------------------------------------

/**
 * Track a window on a cell. `geometry` is where KWin currently has it, which
 * doubles as its remembered floating geometry (PRD §17) the first time we see it.
 */
export function addWindow(ctl, workspaceId, outputId, id, { geometry, appId, focus = true } = {}) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (cell.order.includes(id)) {
    // The adapter re-announces existing windows on every rebuild; take the
    // chance to fill in an app id we did not have the first time.
    if (appId && !recallWindow(ctl.modes, id)?.appId) rememberWindow(ctl.modes, id, { appId });
    return cell;
  }
  cell.order.push(id);
  cell.stacking = floating.raiseWindow(cell.stacking, id);
  // A window that just opened takes focus; one merely being enumerated does
  // not. Without the distinction, re-reading the window list would leave the
  // *last* window "focused", which in Stage decides what is on screen.
  if (focus) cell.focusId = id;
  rememberWindow(ctl.modes, id, { output: outputId, workspace: workspaceId });
  if (appId) rememberWindow(ctl.modes, id, { appId });
  if (geometry) rememberWindow(ctl.modes, id, { floatingGeometry: geometry });
  reconcile(ctl, cell);
  return cell;
}

export function removeWindow(ctl, workspaceId, outputId, id) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (!cell.order.includes(id)) return cell;
  detachFromCell(ctl, cell, id);
  forgetWindow(ctl.modes, id);
  return cell;
}

/**
 * Take a window out of a cell and out of whatever the cell's modes think about
 * it, without forgetting the window itself. Closing a window and moving it to
 * another workspace differ only in whether its memory survives.
 */
function detachFromCell(ctl, cell, id) {
  const at = cell.order.indexOf(id);
  if (at === -1) return;
  cell.order.splice(at, 1);
  cell.excluded.delete(id);
  cell.floating.delete(id);
  if (cell.fullscreenId === id) cell.fullscreenId = null;
  cell.stacking = cell.stacking.filter((w) => w !== id);
  if (cell.focusId === id) {
    cell.focusId = cell.order[Math.min(at, cell.order.length - 1)] ?? null;
  }
  cell.tree = tree.removeWindow(cell.tree, id);
  cell.strip = scrolling.removeWindow(cell.strip, id);
  // Emptying a stage closes it — an app that is gone should not leave a card in
  // the rail. Only that stage is a candidate, so a stage the user made and has
  // not filled is untouched.
  const owner = stage.stageOf(cell.stages, id);
  cell.stages = stage.ungroupWindow(cell.stages, id);
  if (owner) cell.stages = dropEmptyStages(cell.stages, new Set([owner.id]));
}

/** Windows the controller knows about on this cell, in arrival order. */
export function windows(ctl, workspaceId, outputId) {
  return ensureCell(ctl, workspaceId, outputId).order.slice();
}

/**
 * Take a window out of the layout without forgetting it. A window the user
 * minimized is still theirs — it keeps its place in the order and everything
 * PRD §17 remembers about it — but it must not hold a tile or a slot on the
 * strip while it is not on screen.
 */
export function setExcluded(ctl, workspaceId, outputId, id, excluded) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (excluded) cell.excluded.add(id);
  else cell.excluded.delete(id);
  return cell;
}

export function isExcluded(ctl, workspaceId, outputId, id) {
  return ensureCell(ctl, workspaceId, outputId).excluded.has(id);
}

/** The windows a layout actually places. */
function laidOut(cell) {
  return cell.order.filter((id) => !cell.excluded.has(id));
}

// --- focus ------------------------------------------------------------------

export function focusWindow(ctl, workspaceId, outputId, id, { screen } = {}) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (!cell.order.includes(id)) return cell;
  cell.focusId = id;
  cell.stacking = floating.raiseWindow(cell.stacking, id);
  rememberWindow(ctl.modes, id, { lastFocus: Date.now() });

  // Focus can arrive before the active mode has caught up with the window —
  // it may have just been added, restored from minimized, or moved here from
  // another workspace. Reconcile first so the mode has a slot for it, then
  // check the slot exists before using it.
  const active = mode(ctl, workspaceId, outputId);
  if (active === "scrolling" || active === "stage") {
    reconcile(ctl, cell, screen);
  }

  // Scrolling is the one mode where focus moves the world (PRD §13).
  if (active === "scrolling" && screen && scrolling.columnOf(cell.strip, id) !== -1) {
    cell.strip = scrolling.focusWindow(cell.strip, id, screen.width);
  }
  // Focusing a window in Stage mode switches to that window's stage.
  if (active === "stage") {
    const owner = stage.stageOf(cell.stages, id);
    if (owner && owner.id !== cell.stages.activeId) {
      cell.stages = stage.switchStage(cell.stages, owner.id).state;
    }
  }
  return cell;
}

export function focusedWindow(ctl, workspaceId, outputId) {
  return ensureCell(ctl, workspaceId, outputId).focusId;
}

/** Record where a window actually ended up — the source of floating recall. */
export function noteGeometry(ctl, id, geometry) {
  rememberWindow(ctl.modes, id, { floatingGeometry: geometry });
}

// --- mode switching (PRD §16, §17) -----------------------------------------

/**
 * Switch a cell's mode, capturing the outgoing mode's per-window state first so
 * the switch is reversible, then reconciling the incoming mode's structure
 * against the cell's actual windows.
 */
export function switchMode(ctl, workspaceId, outputId, next, { screen } = {}) {
  if (!MODES.includes(next)) throw new RangeError(`unknown mode: ${next}`);
  const cell = ensureCell(ctl, workspaceId, outputId);
  const current = mode(ctl, workspaceId, outputId);
  if (current !== next) capture(ctl, cell, current, screen);
  setCellMode(ctl.modes, workspaceId, outputId, next);
  reconcile(ctl, cell, screen);
  return cell;
}

export function cycleMode(ctl, workspaceId, outputId, delta = 1, { screen } = {}) {
  const at = MODES.indexOf(mode(ctl, workspaceId, outputId));
  const next = MODES[(at + delta + MODES.length) % MODES.length];
  return switchMode(ctl, workspaceId, outputId, next, { screen });
}

/** Persist the leaving mode's per-window facts listed in PRD §17. */
function capture(ctl, cell, from, screen) {
  if (from === "floating" && screen) {
    const rects = computeFloatingRects(ctl, cell, screen);
    for (const [id, rect] of rects) rememberWindow(ctl.modes, id, { floatingGeometry: rect });
  } else if (from === "tiling") {
    tree.windows(cell.tree).forEach((id, i) => rememberWindow(ctl.modes, id, { tilePosition: i }));
  } else if (from === "scrolling") {
    scrolling.windowIds(cell.strip).forEach((id, i) => {
      const column = cell.strip.columns[scrolling.columnOf(cell.strip, id)];
      rememberWindow(ctl.modes, id, { scrollOrder: i, scrollWidth: column.width });
    });
  } else if (from === "stage") {
    for (const s of cell.stages.stages) {
      for (const id of s.windowIds) rememberWindow(ctl.modes, id, { stageId: s.id });
    }
  }
}

/**
 * Make the active mode's structure agree with `cell.order`. Windows appear and
 * vanish while a mode is not looking — a window opened in Floating has no tile
 * — so every layout starts by closing that gap. Restores remembered ordering
 * where PRD §17 recorded it.
 */
function reconcile(ctl, cell, screen) {
  const active = mode(ctl, cell.workspaceId, cell.outputId);
  const present = new Set(laidOut(cell));
  if (active === "tiling") {
    const inTiling = new Set(tiled(cell));
    for (const id of tree.windows(cell.tree)) {
      if (!inTiling.has(id)) cell.tree = tree.removeWindow(cell.tree, id);
    }
    const have = new Set(tree.windows(cell.tree));
    const missing = tiled(cell).filter((id) => !have.has(id));
    // Remembered tile positions first, so Tiling → Floating → Tiling comes back
    // in the order the user left it rather than in arrival order.
    missing.sort((a, b) => tilePos(ctl, a) - tilePos(ctl, b));
    for (const id of missing) {
      cell.tree = tree.insertWindow(cell.tree, id, {
        at: cell.focusId !== id ? cell.focusId : null,
        screen: screen ?? { x: 0, y: 0, width: 1920, height: 1080 },
        gap: ctl.options.gap,
      });
    }
  } else if (active === "scrolling") {
    for (const id of scrolling.windowIds(cell.strip)) {
      if (!present.has(id)) cell.strip = scrolling.removeWindow(cell.strip, id);
    }
    const have = new Set(scrolling.windowIds(cell.strip));
    const missing = laidOut(cell).filter((id) => !have.has(id));
    missing.sort((a, b) => scrollPos(ctl, a) - scrollPos(ctl, b));
    for (const id of missing) {
      const remembered = recallWindow(ctl.modes, id);
      const width =
        remembered?.scrollWidth ??
        Math.round((screen?.width ?? 1920) * ctl.options.scrollWidthRatio);
      cell.strip = scrolling.insertWindow(cell.strip, id, { width });
    }
  } else if (active === "stage") {
    // Departed windows first, then the stages they emptied, so the rail never
    // shows a stage with nothing behind it. Only stages that *had* windows are
    // pruned — a stage the user just created and has not filled yet is theirs
    // to keep.
    const populated = new Set(
      cell.stages.stages.filter((s) => s.windowIds.length > 0).map((s) => s.id),
    );
    for (const s of cell.stages.stages) {
      for (const id of s.windowIds) {
        if (!present.has(id)) cell.stages = stage.ungroupWindow(cell.stages, id);
      }
    }
    cell.stages = dropEmptyStages(cell.stages, populated);

    for (const id of laidOut(cell)) {
      if (stage.stageOf(cell.stages, id)) continue;
      cell.stages = placeInStage(ctl, cell.stages, id);
    }

    // The active stage has to be one that still exists, and it follows focus:
    // clicking a window is how you switch stages without touching the rail.
    if (!cell.stages.stages.some((s) => s.id === cell.stages.activeId)) {
      cell.stages = { ...cell.stages, activeId: cell.stages.stages[0]?.id ?? null };
    }
    const focused = cell.focusId ? stage.stageOf(cell.stages, cell.focusId) : null;
    if (focused && focused.id !== cell.stages.activeId) {
      cell.stages = { ...cell.stages, activeId: focused.id };
    }
  }
}

// Function declarations, not const arrows: KWin's JS engine rejects a
// temporal-dead-zone reference from `reconcile` above, even though the call
// only happens at run time.
function tilePos(ctl, id) {
  return recallWindow(ctl.modes, id)?.tilePosition ?? Number.MAX_SAFE_INTEGER;
}

function scrollPos(ctl, id) {
  return recallWindow(ctl.modes, id)?.scrollOrder ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Which stage a newly seen window belongs to, in order of preference:
 *
 *  1. the stage it was in before, if that stage still exists (PRD §17);
 *  2. the stage already holding another window of the same application —
 *     Stage Manager's default grouping is one stage per app, and a second
 *     window of an app joins its own stage rather than the one on screen;
 *  3. a new stage of its own.
 *
 * Step 3 is what makes Stage feel like Stage: with four apps open you get four
 * stages and one window on the canvas, not four windows piled onto one stage.
 */
function placeInStage(ctl, stages, id) {
  const mem = recallWindow(ctl.modes, id);

  if (mem?.stageId !== undefined && stages.stages.some((s) => s.id === mem.stageId)) {
    return stage.assignWindow(stages, id, mem.stageId);
  }

  if (mem?.appId) {
    const sibling = stages.stages.find((s) =>
      s.windowIds.some((other) => recallWindow(ctl.modes, other)?.appId === mem.appId),
    );
    if (sibling) return stage.assignWindow(stages, id, sibling.id);
  }

  const created = stage.createStage(stages, mem?.appId ?? "");
  const fresh = created.stages[created.stages.length - 1];
  return stage.assignWindow(created, id, fresh.id);
}

function dropEmptyStages(stages, onlyThese) {
  const kept = stages.stages.filter(
    (s) => s.windowIds.length > 0 || !onlyThese.has(s.id),
  );
  if (kept.length === stages.stages.length) return stages;
  const activeId = kept.some((s) => s.id === stages.activeId)
    ? stages.activeId
    : (kept[0]?.id ?? null);
  return { ...stages, stages: kept, activeId };
}

// --- layout -----------------------------------------------------------------

/**
 * The whole point: where every window on this cell goes right now.
 *
 * @returns {{mode: string, windows: {id: string, rect: object, visible: boolean}[], stacking: string[]}}
 */
export function computeLayout(ctl, workspaceId, outputId, { screen }) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  reconcile(ctl, cell, screen);
  const active = mode(ctl, workspaceId, outputId);

  let placed;
  if (active === "tiling") placed = layoutTiling(ctl, cell, screen);
  else if (active === "scrolling") placed = layoutScrolling(ctl, cell, screen);
  else if (active === "stage") placed = layoutStage(ctl, cell, screen);
  else placed = layoutFloating(ctl, cell, screen);

  // Fullscreen covers rather than hides: the window takes the whole output and
  // everything else keeps its place underneath, which is what every compositor
  // does and what makes leaving fullscreen instant. Hiding the others instead
  // meant un-minimizing them all on the way out, and KWin restores a window's
  // pre-minimize geometry *after* we set ours, so the layout came back wrong.
  if (cell.fullscreenId && laidOut(cell).includes(cell.fullscreenId)) {
    placed = placed.map((placement) =>
      placement.id === cell.fullscreenId
        ? { id: placement.id, rect: { ...screen }, visible: true, fullscreen: true }
        : placement,
    );
  }

  return { mode: active, windows: placed, stacking: cell.stacking.slice() };
}

function computeFloatingRects(ctl, cell, screen) {
  const remembered = new Map();
  const sizes = new Map();
  for (const id of laidOut(cell)) {
    const mem = recallWindow(ctl.modes, id);
    if (mem?.floatingGeometry) remembered.set(id, mem.floatingGeometry);
  }
  return floating.computeFloating({ screen, windows: laidOut(cell), remembered, sizes });
}

function layoutFloating(ctl, cell, screen) {
  const rects = computeFloatingRects(ctl, cell, screen);
  return laidOut(cell).map((id) => ({ id, rect: rects.get(id), visible: true }));
}

function layoutTiling(ctl, cell, screen) {
  const inner = inset(screen, ctl.options.gap);
  // The tree holds the *order* for every policy, not just the automatic one:
  // swapping with master or moving a tile reorders it, and the fixed policies
  // then arrange that order into columns, rows or a main-stack.
  const order = tree.windows(cell.tree);
  const rects = cell.policy === "automatic"
    ? tree.computeRects(cell.tree, inner, ctl.options.gap)
    : tiling.computeTiling({
        screen: inner,
        windows: order,
        policy: cell.policy,
        gap: ctl.options.gap,
        mainRatio: cell.mainRatio,
      });

  const placed = order
    .filter((id) => rects.has(id))
    .map((id) => ({ id, rect: rects.get(id), visible: true }));

  // Windows lifted out of the tiling sit above it, at their own geometry.
  const lifted = laidOut(cell).filter((id) => cell.floating.has(id));
  if (lifted.length) {
    const remembered = new Map();
    for (const id of lifted) {
      const mem = recallWindow(ctl.modes, id);
      if (mem?.floatingGeometry) remembered.set(id, mem.floatingGeometry);
    }
    const free = floating.computeFloating({ screen, windows: lifted, remembered });
    for (const id of lifted) placed.push({ id, rect: free.get(id), visible: true });
  }
  return placed;
}

function layoutScrolling(ctl, cell, screen) {
  const rects = scrolling.layout(cell.strip, {
    x: screen.x,
    y: screen.y,
    height: screen.height,
    gap: ctl.options.gap,
  });
  const left = screen.x;
  const right = screen.x + screen.width;
  return rects.map((r) => ({
    id: r.id,
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    // Off-strip windows stay placed but hidden, so scrolling back is instant.
    visible: r.x < right && r.x + r.width > left,
  }));
}

/** How much of the canvas the frontmost window takes. */
const STAGE_SCALE = 0.92;
/** Each window further back loses this much scale, so it peeks out behind. */
const STAGE_DEPTH_SCALE = 0.05;
/** …and shifts by this much, up and to the left. */
const STAGE_DEPTH_STEP = 26;

function layoutStage(ctl, cell, screen) {
  const stages = cell.stages.stages;
  // Reserve the rail only once there is a second stage to put in it. With one
  // app open there is nothing to show, and an empty reserved strip reads as a
  // bug rather than as a rail. (The rail's own UI is M5-02.)
  const rail = stages.length > 1 ? Math.round(screen.width * ctl.options.stageRailRatio) : 0;
  const canvas = {
    x: screen.x + rail,
    y: screen.y,
    width: screen.width - rail,
    height: screen.height,
  };
  const activeStage = stages.find((s) => s.id === cell.stages.activeId);
  // Assignment order, not stacking order: a window's size and place on the
  // stage must not change just because you clicked it. Raising is KWin's job.
  const onCanvas = activeStage ? activeStage.windowIds : [];
  const rects = stageRects(onCanvas, screen, rail);
  // A window the user has placed on this stage keeps its place, verbatim.
  // Clamping it back inside the canvas is what made stage windows feel
  // undraggable: at 92% of the canvas there is nowhere for the clamp to let
  // them go, so every drag looked like a snap-back. The only thing worth
  // enforcing is that the window is still reachable at all.
  for (const id of onCanvas) {
    const placed = recallWindow(ctl.modes, id)?.stageGeometry;
    if (placed && floating.fitsScreen(placed, canvas)) rects.set(id, placed);
  }
  return laidOut(cell).map((id) => ({
    id,
    rect: rects.get(id) ?? null,
    visible: rects.has(id),
  }));
}

/**
 * Opening placement for one stage's windows: the first is centred and large,
 * each one after it a step smaller and offset up-left so its edge shows.
 *
 * Deliberately not the windows' own floating geometry — that is what made
 * Stage look like floating with a margin. §17 still gives that geometry back
 * on the way out of Stage, which is where it matters. And it is only an
 * opening placement: once the user drags a window it keeps what they chose.
 */
function stageRects(ids, screen, rail) {
  const out = new Map();
  // Centred on the real centre of the screen, not the centre of the canvas
  // (Mariano, 2026-08-29). Keeping the rail out of the centring means the
  // window has to fit between two rail-width margins, so the rail never
  // overlaps it and the layout still looks centred to the eye.
  const usableWidth = screen.width - 2 * rail;
  for (let i = 0; i < ids.length; i++) {
    const depth = i; // the stage's first window is the big centred one
    const scale = Math.max(0.45, STAGE_SCALE - depth * STAGE_DEPTH_SCALE);
    const width = Math.round(usableWidth * scale);
    const height = Math.round(screen.height * scale);
    out.set(ids[i], {
      x: Math.round(screen.x + (screen.width - width) / 2 - depth * STAGE_DEPTH_STEP),
      y: Math.round(screen.y + (screen.height - height) / 2 - depth * STAGE_DEPTH_STEP),
      width,
      height,
    });
  }
  return out;
}

/** Outer margin so tiled windows do not touch the screen edge. */
function inset(screen, gap) {
  return {
    x: screen.x + gap,
    y: screen.y + gap,
    width: Math.max(1, screen.width - gap * 2),
    height: Math.max(1, screen.height - gap * 2),
  };
}

// --- direct manipulation (dragging and resizing) ----------------------------

/** Edge movements below this are rounding, not intent. */
const DRAG_EPSILON = 2;

/**
 * The user just finished dragging or resizing a window. What that *means*
 * depends on the mode, and in every mode it has to mean something — a managed
 * layout that silently undoes the drag reads as a broken window manager.
 *
 *   floating — it is the new geometry
 *   stage    — it is the new geometry *within the stage*, remembered per stage
 *   tiling   — a move re-inserts the window where it was dropped; a resize
 *              drags the underlying split (PRD §12)
 *   scrolling— a move reorders the strip; a resize sets the window's width,
 *              which the strip then keeps (PRD §13)
 *
 * @param {{from: object, to: object, cursor?: {x: number, y: number}, screen: object}} drag
 */
export function applyUserGeometry(ctl, workspaceId, outputId, id, { from, to, cursor, screen }) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (!cell.order.includes(id)) return cell;
  const active = mode(ctl, workspaceId, outputId);
  const moved = isMove(from, to);

  if (active === "floating") {
    rememberWindow(ctl.modes, id, { floatingGeometry: to });
    return cell;
  }

  if (active === "stage") {
    // Stage does not police geometry. Put a window where you want it and it
    // stays there, on that stage, the way macOS behaves.
    rememberWindow(ctl.modes, id, { stageGeometry: to });
    return cell;
  }

  if (active === "tiling") {
    if (moved && cursor) {
      const target = tileAt(ctl, cell, screen, cursor, id);
      if (target) {
        cell.tree = tree.dropAt(cell.tree, id, target.id, quadrantOf(target.rect, cursor));
      }
    } else if (!moved) {
      for (const [edge, delta] of resizeDeltas(from, to)) {
        cell.tree = tree.resizeEdge(
          cell.tree, id, edge, delta, inset(screen, ctl.options.gap), ctl.options.gap,
        );
      }
    }
    return cell;
  }

  if (active === "scrolling") {
    if (moved && cursor) {
      cell.strip = reorderStripTo(cell.strip, id, cursor.x - screen.x + cell.strip.viewportOffset);
    } else if (!moved && Math.abs(to.width - from.width) > DRAG_EPSILON) {
      cell.strip = scrolling.setWidth(cell.strip, id, to.width);
      rememberWindow(ctl.modes, id, { scrollWidth: to.width });
    }
    return cell;
  }

  return cell;
}

/** A move keeps the size and shifts every edge by the same amount. */
function isMove(from, to) {
  return (
    Math.abs(to.width - from.width) <= DRAG_EPSILON &&
    Math.abs(to.height - from.height) <= DRAG_EPSILON &&
    (Math.abs(to.x - from.x) > DRAG_EPSILON || Math.abs(to.y - from.y) > DRAG_EPSILON)
  );
}

/** Which edges the user dragged, and by how much (positive grows the window). */
function resizeDeltas(from, to) {
  const out = [];
  const left = to.x - from.x;
  const right = to.x + to.width - (from.x + from.width);
  const top = to.y - from.y;
  const bottom = to.y + to.height - (from.y + from.height);
  if (Math.abs(left) > DRAG_EPSILON) out.push(["left", -left]);
  if (Math.abs(right) > DRAG_EPSILON) out.push(["right", right]);
  if (Math.abs(top) > DRAG_EPSILON) out.push(["top", -top]);
  if (Math.abs(bottom) > DRAG_EPSILON) out.push(["bottom", bottom]);
  return out;
}

/** The tile under a point, ignoring the window being dragged. */
function tileAt(ctl, cell, screen, point, excludeId) {
  const rects = tree.computeRects(
    cell.tree, inset(screen, ctl.options.gap), ctl.options.gap,
  );
  for (const [id, rect] of rects) {
    if (id === excludeId) continue;
    if (
      point.x >= rect.x && point.x < rect.x + rect.width &&
      point.y >= rect.y && point.y < rect.y + rect.height
    ) {
      return { id, rect };
    }
  }
  return null;
}

/**
 * Which edge of a tile a point is nearest, as a drop quadrant. Whichever axis
 * the point is closer to an edge on wins, so dropping near the top of a wide
 * tile stacks rather than splitting side-by-side.
 */
export function quadrantOf(rect, point) {
  const rx = (point.x - rect.x) / rect.width;
  const ry = (point.y - rect.y) / rect.height;
  const horizontal = Math.min(rx, 1 - rx) <= Math.min(ry, 1 - ry);
  if (horizontal) return rx < 0.5 ? "left" : "right";
  return ry < 0.5 ? "top" : "bottom";
}

/**
 * Move a window so it sits at strip coordinate `stripX` — the position the
 * user actually dropped it at, measured on the strip they were looking at.
 *
 * `target` is an insertion point in the strip *as it stands*, so once the
 * window is lifted out, everything past its old slot shifts down by one.
 */
function reorderStripTo(strip, id, stripX) {
  const at = scrolling.columnOf(strip, id);
  if (at === -1) return strip;

  let cursor = 0;
  let target = strip.columns.length; // dropped past the end
  for (let i = 0; i < strip.columns.length; i++) {
    const column = strip.columns[i];
    if (stripX < cursor + column.width / 2) {
      target = i;
      break;
    }
    cursor += column.width;
  }

  const to = target > at ? target - 1 : target;
  return scrolling.moveColumn(strip, at, to - at);
}

// --- directional navigation (PRD §12: keyboard focus and movement) ---------

/**
 * The window spatially adjacent to `id` in `direction` ('left'|'right'|'up'|
 * 'down'), or null at the edge of the screen. Tiling only — the other modes
 * have their own notion of "next".
 */
export function focusNeighbour(ctl, workspaceId, outputId, id, direction, { screen }) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  const active = mode(ctl, workspaceId, outputId);
  if (active === "tiling") {
    return tree.focusDirection(
      cell.tree, id, direction, inset(screen, ctl.options.gap), ctl.options.gap,
    );
  }
  if (active === "scrolling") {
    // Left and right move between columns; up and down move inside one.
    return scrolling.neighbor(cell.strip, id, direction);
  }
  return null;
}

/** Move a window one place in `direction`; a no-op at the edge. */
export function moveNeighbour(ctl, workspaceId, outputId, id, direction, { screen }) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  const active = mode(ctl, workspaceId, outputId);
  if (active === "tiling") {
    cell.tree = tree.moveDirection(
      cell.tree, id, direction, inset(screen, ctl.options.gap), ctl.options.gap,
    );
  } else if (active === "scrolling") {
    if (direction === "left" || direction === "right") {
      cell.strip = scrolling.moveColumn(
        cell.strip, scrolling.columnOf(cell.strip, id), direction === "right" ? 1 : -1,
      );
    } else {
      cell.strip = scrolling.moveWindowInColumn(cell.strip, id, direction === "down" ? 1 : -1);
    }
  }
  return cell;
}

// --- tiling controls (hyprland parity) --------------------------------------

/** Windows the tiling actually arranges: live, and not lifted out by the user. */
function tiled(cell) {
  return laidOut(cell).filter((id) => !cell.floating.has(id));
}

export function tilingPolicy(ctl, workspaceId, outputId) {
  return ensureCell(ctl, workspaceId, outputId).policy;
}

export function setTilingPolicy(ctl, workspaceId, outputId, policy) {
  if (!tiling.POLICIES.includes(policy)) throw new RangeError(`unknown tiling policy: ${policy}`);
  ensureCell(ctl, workspaceId, outputId).policy = policy;
  return policy;
}

/** Step through automatic → columns → rows → main-stack and back. */
export function cycleTilingPolicy(ctl, workspaceId, outputId, delta = 1) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  const at = tiling.POLICIES.indexOf(cell.policy);
  const next = (at + delta + tiling.POLICIES.length) % tiling.POLICIES.length;
  cell.policy = tiling.POLICIES[next];
  return cell.policy;
}

/** Flip the split this window sits in — hyprland's togglesplit. */
export function toggleSplitOrientation(ctl, workspaceId, outputId, id) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (mode(ctl, workspaceId, outputId) !== "tiling") return cell;
  cell.tree = tree.toggleOrientation(cell.tree, id);
  return cell;
}

export function swapWithMaster(ctl, workspaceId, outputId, id) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (mode(ctl, workspaceId, outputId) !== "tiling") return cell;
  cell.tree = tree.swapWithMaster(cell.tree, id);
  return cell;
}

/** The next window in tile order, wrapping — hyprland's cyclenext. */
export function cycleTile(ctl, workspaceId, outputId, id, delta = 1) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (mode(ctl, workspaceId, outputId) !== "tiling") return null;
  return tree.cycleNext(cell.tree, id, delta);
}

/**
 * Lift a window out of the tiling so it floats above it, or drop it back in —
 * hyprland's togglefloating. The escape hatch every tiling WM needs: some
 * windows are dialogs in all but type.
 */
export function toggleWindowFloating(ctl, workspaceId, outputId, id, { screen } = {}) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (!cell.order.includes(id)) return false;
  if (cell.floating.has(id)) {
    cell.floating.delete(id);
  } else {
    cell.floating.add(id);
    cell.tree = tree.removeWindow(cell.tree, id);
  }
  reconcile(ctl, cell, screen);
  return cell.floating.has(id);
}

export function isWindowFloating(ctl, workspaceId, outputId, id) {
  return ensureCell(ctl, workspaceId, outputId).floating.has(id);
}

/**
 * Give one window the whole screen and hide the rest, or give it back. Works
 * in every mode, because "make this the only thing" is not a tiling idea.
 */
export function toggleFullScreen(ctl, workspaceId, outputId, id) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (!cell.order.includes(id)) return null;
  cell.fullscreenId = cell.fullscreenId === id ? null : id;
  return cell.fullscreenId;
}

export function fullScreenWindow(ctl, workspaceId, outputId) {
  return ensureCell(ctl, workspaceId, outputId).fullscreenId;
}

/**
 * Keyboard resize — hyprland's resizeactive. In the tree policies this drags
 * the underlying split; in the fixed policies there is no split to drag, so it
 * moves the main column's ratio instead.
 */
export function resizeActive(ctl, workspaceId, outputId, id, edge, deltaPx, { screen }) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  const active = mode(ctl, workspaceId, outputId);

  if (active === "scrolling") {
    const at = scrolling.columnOf(cell.strip, id);
    if (at === -1) return cell;
    const width = Math.max(120, cell.strip.columns[at].width + (edge === "left" ? -deltaPx : deltaPx));
    cell.strip = scrolling.setColumnWidth(cell.strip, at, width);
    rememberWindow(ctl.modes, id, { scrollWidth: width });
    return cell;
  }

  if (active !== "tiling") return cell;

  if (cell.policy === "automatic") {
    cell.tree = tree.resizeEdge(
      cell.tree, id, edge, deltaPx, inset(screen, ctl.options.gap), ctl.options.gap,
    );
    return cell;
  }
  if (edge === "left" || edge === "right") {
    const span = Math.max(1, screen.width - ctl.options.gap * 2);
    const grow = edge === "right" ? deltaPx : -deltaPx;
    cell.mainRatio = Math.max(0.1, Math.min(0.9, cell.mainRatio + grow / span));
  }
  return cell;
}

// --- scrolling controls (niri parity) ---------------------------------------

function scrollingCell(ctl, workspaceId, outputId) {
  if (mode(ctl, workspaceId, outputId) !== "scrolling") return null;
  return ensureCell(ctl, workspaceId, outputId);
}

/** Pull the next column's window into this one — niri's consume. */
export function consumeIntoColumn(ctl, workspaceId, outputId, id) {
  const cell = scrollingCell(ctl, workspaceId, outputId);
  if (!cell) return false;
  const at = scrolling.columnOf(cell.strip, id);
  if (at === -1) return false;
  const before = cell.strip;
  cell.strip = scrolling.consume(cell.strip, at);
  return cell.strip !== before;
}

/** Push a window out of its column into one of its own — niri's expel. */
export function expelFromColumn(ctl, workspaceId, outputId, id) {
  const cell = scrollingCell(ctl, workspaceId, outputId);
  if (!cell) return false;
  const before = cell.strip;
  cell.strip = scrolling.expel(cell.strip, id);
  return cell.strip !== before;
}

/** Step a column through the preset widths — niri's switch-preset-column-width. */
export function cycleColumnWidth(ctl, workspaceId, outputId, id, delta, { screen }) {
  const cell = scrollingCell(ctl, workspaceId, outputId);
  if (!cell) return null;
  const at = scrolling.columnOf(cell.strip, id);
  if (at === -1) return null;
  cell.strip = scrolling.cyclePresetWidth(cell.strip, at, screen.width, delta);
  const width = cell.strip.columns[at].width;
  for (const member of cell.strip.columns[at].windows) {
    rememberWindow(ctl.modes, member, { scrollWidth: width });
  }
  return width;
}

/** Put the focused column in the middle of the viewport. */
export function centerColumn(ctl, workspaceId, outputId, id, { screen }) {
  const cell = scrollingCell(ctl, workspaceId, outputId);
  if (!cell) return false;
  const at = scrolling.columnOf(cell.strip, id);
  if (at === -1) return false;
  cell.strip = scrolling.centerColumn(cell.strip, at, screen.width);
  return true;
}

/** The window at one end of the strip, for focus-first / focus-last. */
export function edgeWindow(ctl, workspaceId, outputId, which) {
  const cell = scrollingCell(ctl, workspaceId, outputId);
  if (!cell) return null;
  return which === "first"
    ? scrolling.firstWindow(cell.strip)
    : scrolling.lastWindow(cell.strip);
}

/** How the strip is arranged right now, for tests and for an indicator. */
export function columns(ctl, workspaceId, outputId) {
  return ensureCell(ctl, workspaceId, outputId).strip.columns.map((c) => ({
    windows: c.windows.slice(),
    width: c.width,
    focus: c.focus,
  }));
}

// --- window actions (Raycast-style placement) -------------------------------

/** Modes where the user places windows, so a placement action has meaning. */
const PLACEMENT_MODES = ["floating", "stage"];

/**
 * Run a named placement action ("almost-maximize", "left-half", "center", …)
 * on a window, and remember the result so the mode keeps it.
 *
 * Only Floating and Stage take these (Mariano, 2026-08-29): Tiling and
 * Scrolling decide placement themselves, and "left half" has nothing to mean
 * inside a split tree. Returns the rect to apply, or null if the action does
 * not apply here — the caller can then leave the window alone rather than
 * guess.
 */
export function applyAction(ctl, workspaceId, outputId, id, action, { screen, frame }) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (!cell.order.includes(id)) return null;
  const active = mode(ctl, workspaceId, outputId);
  if (!PLACEMENT_MODES.includes(active)) return null;

  const rect = actions.actionRect(action, {
    frame,
    workArea: screen,
    gap: ctl.options.gap,
  });
  if (active === "floating") rememberWindow(ctl.modes, id, { floatingGeometry: rect });
  else rememberWindow(ctl.modes, id, { stageGeometry: rect });
  return rect;
}

// --- stage operations surfaced to the UI (PRD §14) --------------------------

export function stages(ctl, workspaceId, outputId) {
  return ensureCell(ctl, workspaceId, outputId).stages;
}

/**
 * Make a stage the active one, and put focus on it.
 *
 * Focus has to move too: reconcile derives the active stage from the focused
 * window, so a switch that left focus behind would be undone on the very next
 * layout. Moving focus is also what the user means by "switch stage".
 */
export function switchStage(ctl, workspaceId, outputId, stageId) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  const result = stage.switchStage(cell.stages, stageId);
  cell.stages = result.state;
  focusStage(ctl, cell, stageId);
  return result;
}

/** Put focus on a stage's most recently raised window. */
function focusStage(ctl, cell, stageId) {
  const target = cell.stages.stages.find((s) => s.id === stageId);
  if (!target || target.windowIds.length === 0) return;
  const live = target.windowIds.filter((id) => !cell.excluded.has(id));
  const pool = live.length ? live : target.windowIds;
  const raised = cell.stacking.filter((id) => pool.includes(id));
  cell.focusId = raised.length ? raised[raised.length - 1] : pool[pool.length - 1];
}

/** Step to the next or previous stage on this cell (Stage Manager's rail). */
export function cycleStage(ctl, workspaceId, outputId, delta = 1) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  const stages = cell.stages.stages;
  if (stages.length < 2) return cell.stages.activeId;
  const at = stages.findIndex((s) => s.id === cell.stages.activeId);
  const next = stages[((at === -1 ? 0 : at) + delta + stages.length) % stages.length];
  cell.stages = stage.switchStage(cell.stages, next.id).state;
  focusStage(ctl, cell, next.id);
  return cell.stages.activeId;
}

/**
 * Pull a window out onto a stage of its own — the counterpart to dragging one
 * into a stage. Its remembered stage is cleared so reconcile does not put it
 * straight back where it came from.
 */
export function moveWindowToNewStage(ctl, workspaceId, outputId, id, name = "") {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (!cell.order.includes(id)) return null;
  const owner = stage.stageOf(cell.stages, id);
  cell.stages = stage.ungroupWindow(cell.stages, id);
  if (owner) cell.stages = dropEmptyStages(cell.stages, new Set([owner.id]));
  cell.stages = stage.createStage(cell.stages, name);
  const fresh = cell.stages.stages[cell.stages.stages.length - 1];
  cell.stages = stage.assignWindow(cell.stages, id, fresh.id);
  cell.stages = { ...cell.stages, activeId: fresh.id };
  cell.focusId = id;
  rememberWindow(ctl.modes, id, { stageId: fresh.id });
  return fresh.id;
}

/** Put a window on the stage next door — Stage Manager's "group with". */
export function moveWindowToStage(ctl, workspaceId, outputId, id, stageId) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (!cell.order.includes(id)) return false;
  if (!cell.stages.stages.some((st) => st.id === stageId)) return false;
  const owner = stage.stageOf(cell.stages, id);
  cell.stages = stage.assignWindow(cell.stages, id, stageId);
  if (owner && owner.id !== stageId) {
    cell.stages = dropEmptyStages(cell.stages, new Set([owner.id]));
  }
  rememberWindow(ctl.modes, id, { stageId });
  return true;
}

/** Fold the active stage into its neighbour — Stage Manager's merge. */
export function mergeActiveStage(ctl, workspaceId, outputId, delta = 1) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  const stages = cell.stages.stages;
  if (stages.length < 2) return false;
  const at = stages.findIndex((st) => st.id === cell.stages.activeId);
  if (at === -1) return false;
  const into = stages[(at + delta + stages.length) % stages.length];
  const from = stages[at];
  cell.stages = stage.mergeStages(cell.stages, from.id, into.id);
  for (const id of from.windowIds) rememberWindow(ctl.modes, id, { stageId: into.id });
  return true;
}

/**
 * Move a window to another monitor, onto whatever workspace that monitor is
 * showing — hyprland's `movewindow mon:`.
 */
export function moveWindowToOutput(ctl, fromOutput, toOutput, id, { screen } = {}) {
  if (fromOutput === toOutput) return null;
  const from = workspaceOf(ctl, fromOutput, id);
  if (from === null) return null;
  const target = currentWorkspace(ctl, toOutput);

  const source = ensureCell(ctl, from, fromOutput);
  const wasExcluded = source.excluded.has(id);
  detachFromCell(ctl, source, id);

  const destination = ensureCell(ctl, target, toOutput);
  destination.order.push(id);
  destination.stacking = floating.raiseWindow(destination.stacking, id);
  destination.focusId = id;
  if (wasExcluded) destination.excluded.add(id);
  rememberWindow(ctl.modes, id, { output: toOutput, workspace: target });
  reconcile(ctl, destination, screen);
  reconcile(ctl, source, screen);
  return { outputId: toOutput, workspaceId: target };
}

export function newStage(ctl, workspaceId, outputId, name) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  cell.stages = stage.createStage(cell.stages, name);
  return cell.stages;
}

// --- persistence (PRD §10: mode state is persistent) ------------------------

export function serialize(ctl) {
  const cells = [];
  for (const [k, cell] of ctl.cells) {
    cells.push([
      k,
      {
        workspaceId: cell.workspaceId,
        outputId: cell.outputId,
        order: cell.order,
        excluded: [...cell.excluded],
        policy: cell.policy,
        mainRatio: cell.mainRatio,
        floating: [...cell.floating],
        fullscreenId: cell.fullscreenId,
        focusId: cell.focusId,
        stacking: cell.stacking,
        tree: cell.tree,
        strip: cell.strip,
        stages: cell.stages,
      },
    ]);
  }
  return JSON.stringify({
    version: 1,
    options: ctl.options,
    modes: serializeModes(ctl.modes),
    outputs: [...ctl.outputs].map(([id, out]) => [id, { current: out.current }]),
    cells,
  });
}

export function deserialize(json) {
  const raw = JSON.parse(json);
  const ctl = createController(raw.options ?? {});
  ctl.modes = deserializeModes(raw.modes);
  for (const [id, out] of raw.outputs ?? []) ctl.outputs.set(id, { current: out.current ?? 1 });
  for (const [k, cell] of raw.cells ?? []) {
    ctl.cells.set(k, {
      workspaceId: cell.workspaceId,
      outputId: cell.outputId,
      order: cell.order ?? [],
      excluded: new Set(cell.excluded ?? []),
      policy: cell.policy ?? "automatic",
      mainRatio: cell.mainRatio ?? 0.5,
      floating: new Set(cell.floating ?? []),
      fullscreenId: cell.fullscreenId ?? null,
      focusId: cell.focusId ?? null,
      stacking: cell.stacking ?? [],
      tree: cell.tree ?? null,
      strip: cell.strip ?? scrolling.createStrip(),
      stages: cell.stages ?? stage.createStageState(),
    });
  }
  return ctl;
}
