// Pure tiling layout computation (PRD §12). Rects in, rects out — no KWin types.

/** @typedef {{x: number, y: number, width: number, height: number}} Rect */

export const POLICIES = ["automatic", "columns", "rows", "main-stack"];

/**
 * Compute tile rects for an ordered window list.
 *
 * Policies:
 * - automatic: 1 → full screen; N ≥ 2 → main-stack at 0.5 ratio, which
 *   reproduces the PRD §12 diagrams (2 = equal columns, 3 = A | B/C).
 * - columns: N equal-width columns.
 * - rows: N equal-height rows.
 * - main-stack: first window is the main column at mainRatio; the rest stack
 *   vertically in the remaining column.
 *
 * @param {{screen: Rect, windows: string[], policy?: string, gap?: number, mainRatio?: number}} opts
 * @returns {Map<string, Rect>}
 */
export function computeTiling({ screen, windows, policy = "automatic", gap = 0, mainRatio = 0.5 }) {
  if (!POLICIES.includes(policy)) throw new RangeError(`unknown tiling policy: ${policy}`);
  const out = new Map();
  const n = windows.length;
  if (n === 0) return out;
  if (n === 1) {
    out.set(windows[0], { ...screen });
    return out;
  }
  if (policy === "columns") {
    splitH(screen, n, gap).forEach((rect, i) => out.set(windows[i], rect));
    return out;
  }
  if (policy === "rows") {
    splitV(screen, n, gap).forEach((rect, i) => out.set(windows[i], rect));
    return out;
  }
  // automatic (n ≥ 2) and main-stack
  const ratio = policy === "automatic" ? 0.5 : mainRatio;
  const mainWidth = Math.round((screen.width - gap) * ratio);
  out.set(windows[0], { x: screen.x, y: screen.y, width: mainWidth, height: screen.height });
  const stackRect = {
    x: screen.x + mainWidth + gap,
    y: screen.y,
    width: screen.width - mainWidth - gap,
    height: screen.height,
  };
  splitV(stackRect, n - 1, gap).forEach((rect, i) => out.set(windows[i + 1], rect));
  return out;
}

/** Split a rect into n columns; the last column absorbs rounding remainder. */
function splitH(rect, n, gap) {
  const step = (rect.width - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => {
    const x = rect.x + Math.round(i * (step + gap));
    const nextX = i === n - 1 ? rect.x + rect.width : rect.x + Math.round((i + 1) * (step + gap)) - gap;
    return { x, y: rect.y, width: nextX - x, height: rect.height };
  });
}

/** Split a rect into n rows; the last row absorbs rounding remainder. */
function splitV(rect, n, gap) {
  const step = (rect.height - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => {
    const y = rect.y + Math.round(i * (step + gap));
    const nextY = i === n - 1 ? rect.y + rect.height : rect.y + Math.round((i + 1) * (step + gap)) - gap;
    return { x: rect.x, y, width: rect.width, height: nextY - y };
  });
}

/** Reorder: move a window earlier/later in the tile order by delta positions. */
export function reorderWindow(windows, id, delta) {
  const from = windows.indexOf(id);
  if (from === -1) return windows.slice();
  const to = Math.max(0, Math.min(windows.length - 1, from + delta));
  const next = windows.slice();
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
