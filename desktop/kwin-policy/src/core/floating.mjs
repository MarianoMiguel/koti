// Floating mode (PRD §11). Floating is conventional Plasma/KWin, so the policy
// layer's job here is deliberately small: remember where windows were, put new
// windows somewhere sensible, and keep everything reachable on the current
// output. Pure — rects in, rects out.

/** @typedef {{x: number, y: number, width: number, height: number}} Rect */

/** Default size for a window we have never seen, as a fraction of the screen. */
const DEFAULT_SIZE = { width: 0.6, height: 0.7 };

/** Cascade step, in px, between successive unplaced windows. */
export const CASCADE_STEP = 32;

/** How many steps before the cascade wraps back to the origin. */
const CASCADE_WRAP = 8;

/**
 * Where the nth never-before-seen window lands: a classic cascade from the
 * top-left of the work area, wrapping so a long-running session cannot walk
 * windows off the bottom-right corner.
 *
 * @param {Rect} screen work area
 * @param {number} index 0-based arrival index
 * @param {{size?: {width: number, height: number}}} [opts] size in px
 * @returns {Rect}
 */
export function cascadePlacement(screen, index, { size } = {}) {
  const width = size?.width ?? Math.round(screen.width * DEFAULT_SIZE.width);
  const height = size?.height ?? Math.round(screen.height * DEFAULT_SIZE.height);
  const step = (index % CASCADE_WRAP) * CASCADE_STEP;
  return clampToScreen({ x: screen.x + step, y: screen.y + step, width, height }, screen);
}

/**
 * Keep a rect inside the work area: shrink it if it is larger than the screen,
 * then slide it back in. A window may never end up with its title bar off the
 * top or its body entirely past an edge — that is how windows get lost when an
 * output is unplugged (PRD §17 remembers the monitor; this makes the recall safe).
 *
 * @param {Rect} rect
 * @param {Rect} screen
 * @returns {Rect}
 */
export function clampToScreen(rect, screen) {
  const width = Math.min(rect.width, screen.width);
  const height = Math.min(rect.height, screen.height);
  const x = Math.max(screen.x, Math.min(rect.x, screen.x + screen.width - width));
  const y = Math.max(screen.y, Math.min(rect.y, screen.y + screen.height - height));
  return { x, y, width, height };
}

/** True when a remembered rect is still usable on this screen (any overlap at all). */
export function fitsScreen(rect, screen) {
  if (!rect) return false;
  return (
    rect.x < screen.x + screen.width &&
    rect.y < screen.y + screen.height &&
    rect.x + rect.width > screen.x &&
    rect.y + rect.height > screen.y
  );
}

/**
 * Geometry for every floating window: remembered geometry when we have it and
 * it still lands on this screen, a cascade slot otherwise. This is the §17
 * "Floating → Tiling → Floating restores meaningful geometry" path.
 *
 * @param {{screen: Rect, windows: string[], remembered?: Map<string, Rect> | Record<string, Rect>, sizes?: Map<string, {width: number, height: number}>}} opts
 * @returns {Map<string, Rect>}
 */
export function computeFloating({ screen, windows, remembered, sizes }) {
  const recall = toGetter(remembered);
  const sizeOf = toGetter(sizes);
  const out = new Map();
  let cascadeIndex = 0;
  for (const id of windows) {
    const saved = recall(id);
    if (fitsScreen(saved, screen)) {
      out.set(id, clampToScreen(saved, screen));
    } else {
      out.set(id, cascadePlacement(screen, cascadeIndex++, { size: sizeOf(id) }));
    }
  }
  return out;
}

/** Raise a window to the top of a bottom→top stacking order. */
export function raiseWindow(order, id) {
  const next = order.filter((w) => w !== id);
  next.push(id);
  return next;
}

function toGetter(source) {
  if (!source) return () => undefined;
  if (source instanceof Map) return (id) => source.get(id);
  return (id) => source[id];
}
