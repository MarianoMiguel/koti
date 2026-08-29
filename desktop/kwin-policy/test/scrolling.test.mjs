import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createStrip,
  insertWindow,
  removeWindow,
  windowIds,
  columnOf,
  columnCount,
  focusedWindow,
  setColumnWidth,
  setWidth,
  cyclePresetWidth,
  moveColumn,
  moveWindowInColumn,
  consume,
  expel,
  columnStart,
  stripWidth,
  focusWindow,
  centerColumn,
  neighbor,
  firstWindow,
  lastWindow,
  layout,
  PRESET_WIDTHS,
} from "../src/core/scrolling.mjs";

const VIEWPORT = 1000;
const HEIGHT = 600;

function strip(...ids) {
  let s = createStrip();
  for (const id of ids) s = insertWindow(s, id, { width: 500 });
  return s;
}

const rects = (s) => layout(s, { y: 0, height: HEIGHT });
const rectOf = (s, id) => rects(s).find((r) => r.id === id);

// --- columns ----------------------------------------------------------------

test("each new window opens a column of its own (niri's default)", () => {
  const s = strip("a", "b", "c");
  assert.equal(columnCount(s), 3);
  assert.deepEqual(windowIds(s), ["a", "b", "c"]);
});

test("a window cannot be inserted twice", () => {
  assert.throws(() => insertWindow(strip("a"), "a", { width: 500 }), /already in strip/);
});

test("columns keep stable widths as more windows appear (PRD §13)", () => {
  const s = strip("a", "b", "c");
  for (const id of ["a", "b", "c"]) assert.equal(rectOf(s, id).width, 500);
});

test("columns sit shoulder to shoulder along the strip", () => {
  const s = strip("a", "b", "c");
  assert.equal(columnStart(s, 0), 0);
  assert.equal(columnStart(s, 1), 500);
  assert.equal(columnStart(s, 2), 1000);
  assert.equal(stripWidth(s), 1500);
});

test("a new window opens beside the one it was opened from", () => {
  let s = strip("a", "c");
  s = insertWindow(s, "b", { width: 500, afterId: "a" });
  assert.deepEqual(windowIds(s), ["a", "b", "c"]);
});

test("removing a window removes its column", () => {
  const s = removeWindow(strip("a", "b"), "a");
  assert.equal(columnCount(s), 1);
  assert.deepEqual(windowIds(s), ["b"]);
});

test("removing an unknown window is a no-op", () => {
  const s = strip("a");
  assert.deepEqual(removeWindow(s, "ghost"), s);
});

// --- stacking inside a column ----------------------------------------------

test("consume pulls the next column's window into this one", () => {
  const s = consume(strip("a", "b", "c"), 0);
  assert.equal(columnCount(s), 2);
  assert.deepEqual(s.columns[0].windows, ["a", "b"]);
  assert.deepEqual(s.columns[1].windows, ["c"]);
});

test("consumed windows split their column's height", () => {
  const s = consume(strip("a", "b"), 0);
  const a = rectOf(s, "a");
  const b = rectOf(s, "b");
  assert.equal(a.x, b.x, "same column, so same x");
  assert.equal(a.width, b.width);
  assert.equal(a.height + b.height, HEIGHT);
  assert.equal(b.y, a.y + a.height);
});

test("consume at the last column does nothing", () => {
  const s = strip("a", "b");
  assert.deepEqual(consume(s, 1), s);
});

test("expel pushes a window out into its own column", () => {
  let s = consume(strip("a", "b"), 0);
  s = expel(s, "b");
  assert.equal(columnCount(s), 2);
  assert.deepEqual(s.columns[0].windows, ["a"]);
  assert.deepEqual(s.columns[1].windows, ["b"]);
});

test("expel does nothing to a window that is already alone", () => {
  const s = strip("a", "b");
  assert.deepEqual(expel(s, "a"), s);
});

test("consume then expel returns to where it started", () => {
  const s = strip("a", "b", "c");
  assert.deepEqual(windowIds(expel(consume(s, 0), "b")), windowIds(s));
});

test("a window can be reordered inside its column", () => {
  let s = consume(consume(strip("a", "b", "c"), 0), 0);
  assert.deepEqual(s.columns[0].windows, ["a", "b", "c"]);
  s = moveWindowInColumn(s, "c", -1);
  assert.deepEqual(s.columns[0].windows, ["a", "c", "b"]);
});

// --- widths -----------------------------------------------------------------

test("a column's width can be set directly", () => {
  const s = setColumnWidth(strip("a", "b"), 0, 300);
  assert.equal(rectOf(s, "a").width, 300);
  assert.equal(rectOf(s, "b").x, 300);
});

test("setWidth finds the column holding a window", () => {
  const s = setWidth(strip("a", "b"), "b", 250);
  assert.equal(rectOf(s, "b").width, 250);
});

test("preset widths cycle through the niri thirds and halves", () => {
  let s = setColumnWidth(strip("a"), 0, Math.round(VIEWPORT * PRESET_WIDTHS[0]));
  const seen = [];
  for (let i = 0; i < PRESET_WIDTHS.length; i++) {
    s = cyclePresetWidth(s, 0, VIEWPORT, 1);
    seen.push(s.columns[0].width);
  }
  assert.deepEqual(seen, [
    Math.round(VIEWPORT * PRESET_WIDTHS[1]),
    Math.round(VIEWPORT * PRESET_WIDTHS[2]),
    Math.round(VIEWPORT * PRESET_WIDTHS[0]),
  ]);
});

test("cycling presets from a hand-dragged width snaps to the next preset", () => {
  const s = cyclePresetWidth(setColumnWidth(strip("a"), 0, 400), 0, VIEWPORT, 1);
  assert.equal(s.columns[0].width, Math.round(VIEWPORT * PRESET_WIDTHS[1]));
});

// --- focus and the viewport -------------------------------------------------

test("focus scrolls the least needed to reveal a column", () => {
  const s = focusWindow(strip("a", "b", "c"), "c", VIEWPORT);
  assert.equal(s.viewportOffset, 500, "c's right edge meets the viewport's");
  assert.equal(rectOf(s, "c").x + rectOf(s, "c").width, VIEWPORT);
});

test("focusing something already on screen does not scroll", () => {
  const s = focusWindow(strip("a", "b", "c"), "a", VIEWPORT);
  assert.equal(s.viewportOffset, 0);
});

test("a column wider than the viewport aligns its left edge", () => {
  let s = setColumnWidth(strip("a", "b"), 1, 1400);
  s = focusWindow(s, "b", VIEWPORT);
  assert.equal(rectOf(s, "b").x, 0);
});

test("centring a column puts it in the middle of the viewport", () => {
  const s = centerColumn(strip("a", "b", "c"), 1, VIEWPORT);
  const r = rectOf(s, "b");
  assert.equal(r.x + r.width / 2, VIEWPORT / 2);
});

test("focus tracks which window in a column is current", () => {
  let s = consume(strip("a", "b"), 0);
  s = focusWindow(s, "b", VIEWPORT);
  assert.equal(focusedWindow(s), "b");
});

// --- navigation -------------------------------------------------------------

test("left and right move between columns", () => {
  const s = strip("a", "b", "c");
  assert.equal(neighbor(s, "b", "right"), "c");
  assert.equal(neighbor(s, "b", "left"), "a");
  assert.equal(neighbor(s, "c", "right"), null);
  assert.equal(neighbor(s, "a", "left"), null);
});

test("up and down move inside a column", () => {
  const s = consume(strip("a", "b"), 0);
  assert.equal(neighbor(s, "a", "down"), "b");
  assert.equal(neighbor(s, "b", "up"), "a");
  assert.equal(neighbor(s, "b", "down"), null);
});

test("moving right from a stacked column lands on the next column's focus", () => {
  let s = consume(strip("a", "b", "c"), 0);
  s = focusWindow(s, "c", VIEWPORT);
  assert.equal(neighbor(s, "a", "right"), "c");
});

test("first and last reach the ends of the strip", () => {
  const s = strip("a", "b", "c");
  assert.equal(firstWindow(s), "a");
  assert.equal(lastWindow(s), "c");
  assert.equal(firstWindow(createStrip()), null);
});

test("a whole column can be moved along the strip", () => {
  const s = moveColumn(strip("a", "b", "c"), 0, 1);
  assert.deepEqual(windowIds(s), ["b", "a", "c"]);
});

test("moving a column past the end clamps", () => {
  const s = moveColumn(strip("a", "b"), 1, 5);
  assert.deepEqual(windowIds(s), ["a", "b"]);
});

test("columnOf reports where a window lives", () => {
  const s = consume(strip("a", "b", "c"), 0);
  assert.equal(columnOf(s, "b"), 0);
  assert.equal(columnOf(s, "c"), 1);
  assert.equal(columnOf(s, "ghost"), -1);
});

test("every operation leaves the strip laying out cleanly", () => {
  let s = strip("a", "b", "c", "d");
  s = consume(s, 0);
  s = setColumnWidth(s, 1, 300);
  s = moveColumn(s, 2, -1);
  s = expel(s, "b");
  const placed = rects(s);
  assert.equal(placed.length, 4);
  assert.equal(new Set(placed.map((r) => r.id)).size, 4);
  for (const r of placed) assert.ok(r.width > 0 && r.height > 0);
});
