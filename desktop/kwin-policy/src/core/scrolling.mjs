// niri-style scrollable tiling (PRD §13).
//
// The workspace is an endless horizontal strip of **columns**. A column holds
// one window, or several stacked vertically — that stack is what makes niri's
// consume/expel meaningful, and it is why this is a column model rather than a
// flat row of windows. Columns keep stable widths instead of shrinking as more
// windows appear; the viewport moves to follow focus.
//
// Pure and immutable: every operation returns a new strip.

/**
 * @typedef {{windows: string[], width: number, focus: number}} Column
 * @typedef {{columns: Column[], focusColumn: number, viewportOffset: number}} Strip
 */

/** Column widths a keypress cycles through, as fractions of the viewport. */
export const PRESET_WIDTHS = [1 / 3, 1 / 2, 2 / 3];

/** @returns {Strip} */
export function createStrip() {
  return { columns: [], focusColumn: 0, viewportOffset: 0 };
}

const makeColumn = (windows, width) => ({ windows, width, focus: 0 });

/** Every window on the strip, left to right and top to bottom. */
export function windowIds(strip) {
  const out = [];
  for (const column of strip.columns) out.push(...column.windows);
  return out;
}

export function columnCount(strip) {
  return strip.columns.length;
}

/** Index of the column holding a window, or -1. */
export function columnOf(strip, id) {
  return strip.columns.findIndex((c) => c.windows.includes(id));
}

export function focusedWindow(strip) {
  const column = strip.columns[strip.focusColumn];
  if (!column) return null;
  return column.windows[column.focus] ?? null;
}

/**
 * Add a window as a new column of its own, after the column holding `afterId`
 * (or at the end). A new window opening beside the current one is the default
 * niri behaviour; putting it *into* a column is `consume`.
 */
export function insertWindow(strip, id, { width, afterId = null } = {}) {
  if (columnOf(strip, id) !== -1) throw new Error(`window already in strip: ${id}`);
  const columns = strip.columns.slice();
  const after = afterId === null ? columns.length - 1 : columnOf(strip, afterId);
  const at = after + 1;
  columns.splice(at, 0, makeColumn([id], width));
  return { ...strip, columns, focusColumn: at };
}

export function removeWindow(strip, id) {
  const at = columnOf(strip, id);
  if (at === -1) return strip;
  const columns = strip.columns.slice();
  const column = columns[at];
  const windows = column.windows.filter((w) => w !== id);
  if (windows.length === 0) {
    columns.splice(at, 1);
  } else {
    columns[at] = { ...column, windows, focus: Math.min(column.focus, windows.length - 1) };
  }
  const focusColumn = Math.max(0, Math.min(strip.focusColumn, columns.length - 1));
  return { ...strip, columns, focusColumn };
}

export function setColumnWidth(strip, index, width) {
  if (!strip.columns[index]) return strip;
  const columns = strip.columns.slice();
  columns[index] = { ...columns[index], width: Math.max(1, Math.round(width)) };
  return { ...strip, columns };
}

/** Convenience: set the width of whichever column holds this window. */
export function setWidth(strip, id, width) {
  return setColumnWidth(strip, columnOf(strip, id), width);
}

/**
 * Step a column through the preset widths — niri's
 * `switch-preset-column-width`. Picks the next preset larger (or smaller) than
 * the current width, so it works even after a freehand drag.
 */
export function cyclePresetWidth(strip, index, viewportWidth, delta = 1) {
  const column = strip.columns[index];
  if (!column) return strip;
  const presets = PRESET_WIDTHS.map((f) => Math.round(viewportWidth * f));
  let at = presets.findIndex((w) => Math.abs(w - column.width) <= 2);
  if (at === -1) {
    // Not on a preset: jump to the nearest one in the direction of travel.
    at = delta > 0
      ? presets.findIndex((w) => w > column.width)
      : [...presets].reverse().findIndex((w) => w < column.width);
    if (at === -1) at = delta > 0 ? 0 : presets.length - 1;
    else if (delta < 0) at = presets.length - 1 - at;
    return setColumnWidth(strip, index, presets[at]);
  }
  const next = (at + delta + presets.length) % presets.length;
  return setColumnWidth(strip, index, presets[next]);
}

/** Move a whole column along the strip. */
export function moveColumn(strip, index, delta) {
  if (!strip.columns[index]) return strip;
  const to = Math.max(0, Math.min(strip.columns.length - 1, index + delta));
  if (to === index) return strip;
  const columns = strip.columns.slice();
  const [column] = columns.splice(index, 1);
  columns.splice(to, 0, column);
  return { ...strip, columns, focusColumn: to };
}

/** Move a window up or down inside its own column. */
export function moveWindowInColumn(strip, id, delta) {
  const at = columnOf(strip, id);
  if (at === -1) return strip;
  const column = strip.columns[at];
  const from = column.windows.indexOf(id);
  const to = Math.max(0, Math.min(column.windows.length - 1, from + delta));
  if (to === from) return strip;
  const windows = column.windows.slice();
  const [w] = windows.splice(from, 1);
  windows.splice(to, 0, w);
  const columns = strip.columns.slice();
  columns[at] = { ...column, windows, focus: to };
  return { ...strip, columns };
}

/**
 * Take the top window of the next column into this one — niri's
 * `consume-window-into-column`. Columns are how you stack related windows
 * without leaving the strip.
 */
export function consume(strip, index) {
  const column = strip.columns[index];
  const next = strip.columns[index + 1];
  if (!column || !next) return strip;
  const moved = next.windows[next.focus] ?? next.windows[0];
  const columns = strip.columns.slice();
  columns[index] = {
    ...column,
    windows: [...column.windows, moved],
    focus: column.windows.length,
  };
  const remaining = next.windows.filter((w) => w !== moved);
  if (remaining.length === 0) columns.splice(index + 1, 1);
  else columns[index + 1] = { ...next, windows: remaining, focus: 0 };
  return { ...strip, columns, focusColumn: index };
}

/**
 * Push a window out of its column into a column of its own, just after —
 * niri's `expel-window-from-column`.
 */
export function expel(strip, id) {
  const at = columnOf(strip, id);
  if (at === -1) return strip;
  const column = strip.columns[at];
  if (column.windows.length < 2) return strip; // already alone
  const windows = column.windows.filter((w) => w !== id);
  const columns = strip.columns.slice();
  columns[at] = { ...column, windows, focus: Math.min(column.focus, windows.length - 1) };
  columns.splice(at + 1, 0, makeColumn([id], column.width));
  return { ...strip, columns, focusColumn: at + 1 };
}

/** Strip x-coordinate where a column starts. */
export function columnStart(strip, index) {
  let x = 0;
  for (let i = 0; i < index; i++) x += strip.columns[i].width;
  return x;
}

export function stripWidth(strip) {
  return strip.columns.reduce((sum, c) => sum + c.width, 0);
}

/**
 * Focus a window and scroll the least needed to bring its column fully into
 * view (PRD §13: focus determines viewport movement). A column wider than the
 * viewport aligns its left edge.
 */
export function focusWindow(strip, id, viewportWidth) {
  const at = columnOf(strip, id);
  if (at === -1) return strip;
  const column = strip.columns[at];
  const columns = strip.columns.slice();
  columns[at] = { ...column, focus: column.windows.indexOf(id) };

  const start = columnStart(strip, at);
  const end = start + column.width;
  let offset = strip.viewportOffset;
  if (column.width >= viewportWidth || start < offset) offset = start;
  else if (end > offset + viewportWidth) offset = end - viewportWidth;
  return { ...strip, columns, focusColumn: at, viewportOffset: offset };
}

/** Put a column in the middle of the viewport — niri's `center-column`. */
export function centerColumn(strip, index, viewportWidth) {
  const column = strip.columns[index];
  if (!column) return strip;
  const start = columnStart(strip, index);
  const offset = Math.round(start - (viewportWidth - column.width) / 2);
  return { ...strip, viewportOffset: offset };
}

/**
 * The window one step away in `direction`. Left and right move between
 * columns, landing on that column's focused window; up and down move inside
 * the current column.
 */
export function neighbor(strip, id, direction) {
  const at = columnOf(strip, id);
  if (at === -1) return null;
  const column = strip.columns[at];
  if (direction === "up" || direction === "down") {
    const next = column.windows.indexOf(id) + (direction === "down" ? 1 : -1);
    return column.windows[next] ?? null;
  }
  const nextColumn = strip.columns[at + (direction === "right" ? 1 : -1)];
  if (!nextColumn) return null;
  return nextColumn.windows[nextColumn.focus] ?? nextColumn.windows[0] ?? null;
}

export function firstWindow(strip) {
  const column = strip.columns[0];
  return column ? column.windows[column.focus] ?? column.windows[0] : null;
}

export function lastWindow(strip) {
  const column = strip.columns[strip.columns.length - 1];
  return column ? column.windows[column.focus] ?? column.windows[0] : null;
}

/**
 * Screen-space rects for the current viewport. Columns run left to right at
 * their own widths; windows inside a column split its height evenly.
 *
 * @returns {{id: string, column: number, x: number, y: number, width: number, height: number}[]}
 */
export function layout(strip, { x = 0, y, height, gap = 0 }) {
  const out = [];
  let cursor = -strip.viewportOffset;
  strip.columns.forEach((column, index) => {
    const n = column.windows.length;
    const span = (height - gap * (n - 1)) / n;
    column.windows.forEach((id, row) => {
      const top = Math.round(y + row * (span + gap));
      const bottom = row === n - 1 ? y + height : Math.round(y + (row + 1) * (span + gap)) - gap;
      out.push({
        id,
        column: index,
        x: x + cursor,
        y: top,
        width: column.width,
        height: bottom - top,
      });
    });
    cursor += column.width;
  });
  return out;
}
