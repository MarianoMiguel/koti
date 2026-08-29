// PaperWM-style scrolling strip model (PRD §13). Windows keep stable widths on a
// horizontally continuous strip; the viewport follows focus. Pure and immutable:
// every operation returns a new strip.

/** @typedef {{windows: {id: string, width: number}[], focusId: string | null, viewportOffset: number}} Strip */

/** @returns {Strip} */
export function createStrip() {
  return { windows: [], focusId: null, viewportOffset: 0 };
}

/** Insert a window (after `afterId`, or at the end). New windows take focus. */
export function insertWindow(strip, id, { width, afterId = null } = {}) {
  if (strip.windows.some((w) => w.id === id)) throw new Error(`window already in strip: ${id}`);
  const windows = strip.windows.slice();
  const at = afterId === null ? windows.length : windows.findIndex((w) => w.id === afterId) + 1;
  windows.splice(at, 0, { id, width });
  return { ...strip, windows, focusId: id };
}

export function removeWindow(strip, id) {
  const idx = strip.windows.findIndex((w) => w.id === id);
  if (idx === -1) return strip;
  const windows = strip.windows.filter((w) => w.id !== id);
  const focusId =
    strip.focusId === id
      ? (windows[Math.min(idx, windows.length - 1)]?.id ?? null)
      : strip.focusId;
  return { ...strip, windows, focusId };
}

/** Move a window left/right on the strip by delta positions. */
export function moveWindow(strip, id, delta) {
  const from = strip.windows.findIndex((w) => w.id === id);
  if (from === -1) return strip;
  const to = Math.max(0, Math.min(strip.windows.length - 1, from + delta));
  const windows = strip.windows.slice();
  const [w] = windows.splice(from, 1);
  windows.splice(to, 0, w);
  return { ...strip, windows };
}

export function setWidth(strip, id, width) {
  return {
    ...strip,
    windows: strip.windows.map((w) => (w.id === id ? { ...w, width } : w)),
  };
}

/** Strip x-coordinate where a window starts. */
export function windowStart(strip, id) {
  let x = 0;
  for (const w of strip.windows) {
    if (w.id === id) return x;
    x += w.width;
  }
  throw new Error(`window not in strip: ${id}`);
}

export function stripWidth(strip) {
  return strip.windows.reduce((sum, w) => sum + w.width, 0);
}

/**
 * Focus a window and scroll the minimal amount needed to make it fully
 * visible (PRD §13: focus determines viewport movement). A window wider than
 * the viewport aligns its left edge.
 */
export function focusWindow(strip, id, viewportWidth) {
  const start = windowStart(strip, id);
  const width = strip.windows.find((w) => w.id === id).width;
  const end = start + width;
  let offset = strip.viewportOffset;
  if (width >= viewportWidth || start < offset) offset = start;
  else if (end > offset + viewportWidth) offset = end - viewportWidth;
  return { ...strip, focusId: id, viewportOffset: offset };
}

/** Neighbor id in the strip (dir = -1 left, +1 right), or null at the edge. */
export function neighbor(strip, id, dir) {
  const idx = strip.windows.findIndex((w) => w.id === id);
  const n = strip.windows[idx + dir];
  return n ? n.id : null;
}

/**
 * Screen-space rects for the current viewport.
 * @returns {{id: string, x: number, y: number, width: number, height: number}[]}
 */
export function layout(strip, { x = 0, y, height }) {
  let cursor = -strip.viewportOffset;
  return strip.windows.map((w) => {
    const rect = { id: w.id, x: x + cursor, y, width: w.width, height };
    cursor += w.width;
    return rect;
  });
}
