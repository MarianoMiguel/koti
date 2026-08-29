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
import * as actions from "./actions.mjs";

export { MODES, DEFAULT_MODE };
export { ACTIONS, FRACTIONAL_LAYOUTS, SPECIAL_ACTIONS } from "./actions.mjs";

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
      excluded: new Set(), // present but not laid out — minimized, mostly
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
  const at = cell.order.indexOf(id);
  if (at === -1) return cell;
  cell.order.splice(at, 1);
  cell.excluded.delete(id);
  cell.stacking = cell.stacking.filter((w) => w !== id);
  if (cell.focusId === id) {
    cell.focusId = cell.order[Math.min(at, cell.order.length - 1)] ?? null;
  }
  cell.tree = tree.removeWindow(cell.tree, id);
  cell.strip = scrolling.removeWindow(cell.strip, id);
  // Closing the last window of a stage closes the stage — an app that is gone
  // should not leave a card in the rail. Only that stage is a candidate, so a
  // stage the user made and has not filled is untouched.
  const owner = stage.stageOf(cell.stages, id);
  cell.stages = stage.ungroupWindow(cell.stages, id);
  if (owner) cell.stages = dropEmptyStages(cell.stages, new Set([owner.id]));
  forgetWindow(ctl.modes, id);
  return cell;
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
  const present = new Set(laidOut(cell));
  if (active === "tiling") {
    for (const id of tree.windows(cell.tree)) {
      if (!present.has(id)) cell.tree = tree.removeWindow(cell.tree, id);
    }
    const have = new Set(tree.windows(cell.tree));
    const missing = laidOut(cell).filter((id) => !have.has(id));
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
  const rects = tree.computeRects(cell.tree, inner, ctl.options.gap);
  return laidOut(cell)
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
  const at = strip.windows.findIndex((w) => w.id === id);
  if (at === -1) return strip;

  let cursor = 0;
  let target = strip.windows.length; // dropped past the end
  for (let i = 0; i < strip.windows.length; i++) {
    const w = strip.windows[i];
    if (stripX < cursor + w.width / 2) {
      target = i;
      break;
    }
    cursor += w.width;
  }

  const to = target > at ? target - 1 : target;
  return scrolling.moveWindow(strip, id, to - at);
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
    // The strip only runs one way, so up and down have no neighbour on it.
    if (direction === "left") return scrolling.neighbor(cell.strip, id, -1);
    if (direction === "right") return scrolling.neighbor(cell.strip, id, 1);
    return null;
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
    if (direction === "left") cell.strip = scrolling.moveWindow(cell.strip, id, -1);
    if (direction === "right") cell.strip = scrolling.moveWindow(cell.strip, id, 1);
  }
  return cell;
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
        excluded: [...cell.excluded],
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
      excluded: new Set(cell.excluded ?? []),
      focusId: cell.focusId ?? null,
      stacking: cell.stacking ?? [],
      tree: cell.tree ?? null,
      strip: cell.strip ?? scrolling.createStrip(),
      stages: cell.stages ?? stage.createStageState(),
    });
  }
  return ctl;
}
