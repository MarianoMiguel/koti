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
import * as scrolling from "./scrolling.mjs";
import * as stage from "./stage.mjs";

export { MODES, DEFAULT_MODE };

const DEFAULTS = {
  gap: 8,
  scrollWidthRatio: 0.5, // PRD §13: stable widths, not shrink-to-fit
  stageRailRatio: 0.16, // PRD §14: the rail down the left edge
};

const key = (workspaceId, outputId) => `${workspaceId} ${outputId}`;

export function createController(options = {}) {
  return {
    options: Object.assign({}, DEFAULTS, options),
    modes: createModeState(),
    cells: new Map(),
  };
}

function ensureCell(ctl, workspaceId, outputId) {
  const k = key(workspaceId, outputId);
  let cell = ctl.cells.get(k);
  if (!cell) {
    cell = {
      workspaceId,
      outputId,
      order: [], // arrival order; the spine every mode reconciles against
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
export function addWindow(ctl, workspaceId, outputId, id, { geometry } = {}) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (cell.order.includes(id)) return cell;
  cell.order.push(id);
  cell.stacking = floating.raiseWindow(cell.stacking, id);
  cell.focusId = id;
  rememberWindow(ctl.modes, id, { output: outputId, workspace: workspaceId });
  if (geometry) rememberWindow(ctl.modes, id, { floatingGeometry: geometry });
  reconcile(ctl, cell);
  return cell;
}

export function removeWindow(ctl, workspaceId, outputId, id) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  const at = cell.order.indexOf(id);
  if (at === -1) return cell;
  cell.order.splice(at, 1);
  cell.stacking = cell.stacking.filter((w) => w !== id);
  if (cell.focusId === id) {
    cell.focusId = cell.order[Math.min(at, cell.order.length - 1)] ?? null;
  }
  cell.tree = tree.removeWindow(cell.tree, id);
  cell.strip = scrolling.removeWindow(cell.strip, id);
  cell.stages = stage.ungroupWindow(cell.stages, id);
  forgetWindow(ctl.modes, id);
  return cell;
}

/** Windows the controller knows about on this cell, in arrival order. */
export function windows(ctl, workspaceId, outputId) {
  return ensureCell(ctl, workspaceId, outputId).order.slice();
}

// --- focus ------------------------------------------------------------------

export function focusWindow(ctl, workspaceId, outputId, id, { screen } = {}) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (!cell.order.includes(id)) return cell;
  cell.focusId = id;
  cell.stacking = floating.raiseWindow(cell.stacking, id);
  rememberWindow(ctl.modes, id, { lastFocus: Date.now() });
  // Scrolling is the one mode where focus moves the world (PRD §13).
  if (mode(ctl, workspaceId, outputId) === "scrolling" && screen) {
    cell.strip = scrolling.focusWindow(cell.strip, id, screen.width);
  }
  // Focusing a window in Stage mode switches to that window's stage.
  if (mode(ctl, workspaceId, outputId) === "stage") {
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
    cell.strip.windows.forEach((w, i) =>
      rememberWindow(ctl.modes, w.id, { scrollOrder: i, scrollWidth: w.width }),
    );
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
  const present = new Set(cell.order);
  if (active === "tiling") {
    for (const id of tree.windows(cell.tree)) {
      if (!present.has(id)) cell.tree = tree.removeWindow(cell.tree, id);
    }
    const have = new Set(tree.windows(cell.tree));
    const missing = cell.order.filter((id) => !have.has(id));
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
    for (const w of cell.strip.windows.slice()) {
      if (!present.has(w.id)) cell.strip = scrolling.removeWindow(cell.strip, w.id);
    }
    const have = new Set(cell.strip.windows.map((w) => w.id));
    const missing = cell.order.filter((id) => !have.has(id));
    missing.sort((a, b) => scrollPos(ctl, a) - scrollPos(ctl, b));
    for (const id of missing) {
      const remembered = recallWindow(ctl.modes, id);
      const width =
        remembered?.scrollWidth ??
        Math.round((screen?.width ?? 1920) * ctl.options.scrollWidthRatio);
      cell.strip = scrolling.insertWindow(cell.strip, id, { width });
    }
  } else if (active === "stage") {
    if (cell.stages.stages.length === 0) cell.stages = stage.createStage(cell.stages, "Stage 1");
    for (const id of cell.order) {
      if (stage.stageOf(cell.stages, id)) continue;
      const remembered = recallWindow(ctl.modes, id);
      const target = cell.stages.stages.some((s) => s.id === remembered?.stageId)
        ? remembered.stageId
        : cell.stages.activeId;
      cell.stages = stage.assignWindow(cell.stages, id, target);
    }
    for (const s of cell.stages.stages) {
      for (const id of s.windowIds) {
        if (!present.has(id)) cell.stages = stage.ungroupWindow(cell.stages, id);
      }
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
  return { mode: active, windows: placed, stacking: cell.stacking.slice() };
}

function computeFloatingRects(ctl, cell, screen) {
  const remembered = new Map();
  const sizes = new Map();
  for (const id of cell.order) {
    const mem = recallWindow(ctl.modes, id);
    if (mem?.floatingGeometry) remembered.set(id, mem.floatingGeometry);
  }
  return floating.computeFloating({ screen, windows: cell.order, remembered, sizes });
}

function layoutFloating(ctl, cell, screen) {
  const rects = computeFloatingRects(ctl, cell, screen);
  return cell.order.map((id) => ({ id, rect: rects.get(id), visible: true }));
}

function layoutTiling(ctl, cell, screen) {
  const inner = inset(screen, ctl.options.gap);
  const rects = tree.computeRects(cell.tree, inner, ctl.options.gap);
  return cell.order
    .filter((id) => rects.has(id))
    .map((id) => ({ id, rect: rects.get(id), visible: true }));
}

function layoutScrolling(ctl, cell, screen) {
  const rects = scrolling.layout(cell.strip, {
    x: screen.x,
    y: screen.y,
    height: screen.height,
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

function layoutStage(ctl, cell, screen) {
  const rail = Math.round(screen.width * ctl.options.stageRailRatio);
  const canvas = {
    x: screen.x + rail,
    y: screen.y,
    width: screen.width - rail,
    height: screen.height,
  };
  const activeStage = cell.stages.stages.find((s) => s.id === cell.stages.activeId);
  const onCanvas = activeStage ? activeStage.windowIds : [];
  const remembered = new Map();
  for (const id of onCanvas) {
    const mem = recallWindow(ctl.modes, id);
    if (mem?.floatingGeometry) remembered.set(id, mem.floatingGeometry);
  }
  const rects = floating.computeFloating({ screen: canvas, windows: onCanvas, remembered });
  return cell.order.map((id) => ({
    id,
    rect: rects.get(id) ?? null,
    visible: rects.has(id),
  }));
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

// --- directional navigation (PRD §12: keyboard focus and movement) ---------

/**
 * The window spatially adjacent to `id` in `direction` ('left'|'right'|'up'|
 * 'down'), or null at the edge of the screen. Tiling only — the other modes
 * have their own notion of "next".
 */
export function focusNeighbour(ctl, workspaceId, outputId, id, direction, { screen }) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (mode(ctl, workspaceId, outputId) !== "tiling") return null;
  return tree.focusDirection(cell.tree, id, direction, inset(screen, ctl.options.gap), ctl.options.gap);
}

/** Swap a tile with its neighbour in `direction`; a no-op at the edge. */
export function moveNeighbour(ctl, workspaceId, outputId, id, direction, { screen }) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  if (mode(ctl, workspaceId, outputId) !== "tiling") return cell;
  cell.tree = tree.moveDirection(
    cell.tree, id, direction, inset(screen, ctl.options.gap), ctl.options.gap,
  );
  return cell;
}

// --- stage operations surfaced to the UI (PRD §14) --------------------------

export function stages(ctl, workspaceId, outputId) {
  return ensureCell(ctl, workspaceId, outputId).stages;
}

export function switchStage(ctl, workspaceId, outputId, stageId) {
  const cell = ensureCell(ctl, workspaceId, outputId);
  const result = stage.switchStage(cell.stages, stageId);
  cell.stages = result.state;
  return result;
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
        focusId: cell.focusId,
        stacking: cell.stacking,
        tree: cell.tree,
        strip: cell.strip,
        stages: cell.stages,
      },
    ]);
  }
  return JSON.stringify({ version: 1, options: ctl.options, modes: serializeModes(ctl.modes), cells });
}

export function deserialize(json) {
  const raw = JSON.parse(json);
  const ctl = createController(raw.options ?? {});
  ctl.modes = deserializeModes(raw.modes);
  for (const [k, cell] of raw.cells ?? []) {
    ctl.cells.set(k, {
      workspaceId: cell.workspaceId,
      outputId: cell.outputId,
      order: cell.order ?? [],
      focusId: cell.focusId ?? null,
      stacking: cell.stacking ?? [],
      tree: cell.tree ?? null,
      strip: cell.strip ?? scrolling.createStrip(),
      stages: cell.stages ?? stage.createStageState(),
    });
  }
  return ctl;
}
