import { test } from "node:test";
import assert from "node:assert/strict";
import {
  insertWindow,
  removeWindow,
  computeRects,
  dropAt,
  swapWindows,
  focusDirection,
  moveDirection,
  resizeEdge,
  windows,
  toggleOrientation,
  swapWithMaster,
  cycleNext,
} from "../src/core/tiling-tree.mjs";

const screen = { x: 0, y: 0, width: 1000, height: 600 };

function build(...ids) {
  // Each window inserts at the previously focused (= previously inserted) tile,
  // which is exactly the COSMIC interaction flow.
  let tree = null;
  let focus = null;
  for (const id of ids) {
    tree = insertWindow(tree, id, { at: focus, screen });
    focus = id;
  }
  return tree;
}

test("first window fills the screen", () => {
  const rects = computeRects(build("a"), screen);
  assert.deepEqual(rects.get("a"), screen);
});

test("second window splits the wide tile side-by-side (PRD §12 two-window)", () => {
  const rects = computeRects(build("a", "b"), screen);
  assert.deepEqual(rects.get("a"), { x: 0, y: 0, width: 500, height: 600 });
  assert.deepEqual(rects.get("b"), { x: 500, y: 0, width: 500, height: 600 });
});

test("third window stacks inside the tall focused column (PRD §12 three-window)", () => {
  const rects = computeRects(build("a", "b", "c"), screen);
  assert.deepEqual(rects.get("a"), { x: 0, y: 0, width: 500, height: 600 });
  assert.deepEqual(rects.get("b"), { x: 500, y: 0, width: 500, height: 300 });
  assert.deepEqual(rects.get("c"), { x: 500, y: 300, width: 500, height: 300 });
});

test("orientation follows aspect: a tall screen stacks the second window", () => {
  const tall = { x: 0, y: 0, width: 600, height: 1200 };
  let tree = insertWindow(null, "a", { screen: tall });
  tree = insertWindow(tree, "b", { at: "a", screen: tall });
  const rects = computeRects(tree, tall);
  assert.equal(rects.get("a").height, 600);
  assert.equal(rects.get("b").y, 600);
});

test("insert without a focus target splits the largest tile", () => {
  const tree = build("a", "b", "c"); // a is 500x600 (largest), b/c 500x300
  const withD = insertWindow(tree, "d", { screen });
  const rects = computeRects(withD, screen);
  // a is taller than wide, so d stacks beneath it in the left column
  assert.equal(rects.get("a").height, 300);
  assert.deepEqual(rects.get("d"), { x: 0, y: 300, width: 500, height: 300 });
});

test("closing a window collapses its split cleanly", () => {
  const tree = removeWindow(build("a", "b", "c"), "c");
  const rects = computeRects(tree, screen);
  assert.deepEqual(rects.get("b"), { x: 500, y: 0, width: 500, height: 600 });
  assert.equal(rects.size, 2);
});

test("rects always tile the screen exactly (no gaps, no overlap)", () => {
  const tree = build("a", "b", "c", "d", "e");
  const rects = [...computeRects(tree, screen).values()];
  const area = rects.reduce((s, r) => s + r.width * r.height, 0);
  assert.equal(area, screen.width * screen.height);
});

test("drag-drop onto the left quadrant inserts side-by-side before the target", () => {
  const tree = dropAt(build("a", "b", "c"), "c", "a", "left");
  const rects = computeRects(tree, screen);
  assert.ok(rects.get("c").x < rects.get("a").x);
  assert.equal(rects.get("c").height, 600);
});

test("drag-drop onto the bottom quadrant stacks under the target", () => {
  const tree = dropAt(build("a", "b"), "b", "a", "bottom");
  const rects = computeRects(tree, screen);
  assert.equal(rects.get("b").y, 300);
  assert.equal(rects.get("b").width, 1000);
});

test("unknown quadrant throws", () => {
  assert.throws(() => dropAt(build("a", "b"), "b", "a", "center"), RangeError);
});

test("directional focus finds the spatial neighbor", () => {
  const tree = build("a", "b", "c"); // a | b/c
  assert.equal(focusDirection(tree, "a", "right", screen), "b");
  assert.equal(focusDirection(tree, "b", "down", screen), "c");
  assert.equal(focusDirection(tree, "b", "left", screen), "a");
  assert.equal(focusDirection(tree, "a", "left", screen), null);
});

test("directional move swaps with the neighbor; edges are a no-op", () => {
  const tree = build("a", "b");
  const moved = moveDirection(tree, "a", "right", screen);
  assert.deepEqual(windows(moved), ["b", "a"]);
  assert.equal(moveDirection(tree, "a", "left", screen), tree);
});

test("dragging a shared edge resizes the split", () => {
  const tree = build("a", "b");
  const resized = resizeEdge(tree, "a", "right", 100, screen);
  const rects = computeRects(resized, screen);
  assert.equal(rects.get("a").width, 600);
  assert.equal(rects.get("b").width, 400);
});

test("resizing from the b-side works and ratios clamp at 10%", () => {
  const tree = build("a", "b");
  const grownB = resizeEdge(tree, "b", "left", 100, screen);
  assert.equal(computeRects(grownB, screen).get("b").width, 600);
  const extreme = resizeEdge(tree, "a", "right", 10_000, screen);
  assert.equal(computeRects(extreme, screen).get("b").width, 100);
});

test("a screen-edge resize with no matching split is a no-op", () => {
  const tree = build("a", "b");
  assert.equal(resizeEdge(tree, "a", "left", 50, screen), tree);
});

test("gaps sit between tiles, not at screen edges", () => {
  const rects = computeRects(build("a", "b"), screen, 10);
  assert.equal(rects.get("a").x, 0);
  assert.equal(rects.get("a").width + 10 + rects.get("b").width, 1000);
});

test("trees are plain JSON round-trippable data", () => {
  const tree = build("a", "b", "c");
  const back = JSON.parse(JSON.stringify(tree));
  assert.deepEqual(computeRects(back, screen), computeRects(tree, screen));
});

test("swap keeps geometry, exchanges occupants", () => {
  const tree = swapWindows(build("a", "b", "c"), "a", "c");
  const rects = computeRects(tree, screen);
  assert.deepEqual(rects.get("c"), { x: 0, y: 0, width: 500, height: 600 });
  assert.deepEqual(rects.get("a"), { x: 500, y: 300, width: 500, height: 300 });
});

test("toggling orientation flips the split the window sits in", () => {
  const tree = build("a", "b");
  const before = computeRects(tree, screen);
  assert.equal(before.get("a").width, 500, "starts side by side");
  const flipped = toggleOrientation(tree, "b");
  const after = computeRects(flipped, screen);
  assert.equal(after.get("a").width, 1000, "now stacked");
  assert.equal(after.get("a").height, 300);
  assert.equal(after.get("b").y, 300);
});

test("toggling orientation twice returns to where it started", () => {
  const tree = build("a", "b", "c");
  const there = toggleOrientation(tree, "c");
  const back = toggleOrientation(there, "c");
  assert.deepEqual(computeRects(back, screen), computeRects(tree, screen));
});

test("toggling orientation on a lone window is a no-op", () => {
  const tree = build("a");
  assert.deepEqual(toggleOrientation(tree, "a"), tree);
});

test("swapWithMaster puts the window in the first tile", () => {
  const tree = build("a", "b", "c");
  const order = windows(tree);
  const swapped = swapWithMaster(tree, order[2]);
  assert.equal(windows(swapped)[0], order[2]);
  assert.equal(windows(swapped)[2], order[0]);
});

test("swapWithMaster is a no-op when you are already the master", () => {
  const tree = build("a", "b");
  const master = windows(tree)[0];
  assert.deepEqual(swapWithMaster(tree, master), tree);
});

test("cycleNext walks tile order and wraps", () => {
  const tree = build("a", "b", "c");
  const order = windows(tree);
  assert.equal(cycleNext(tree, order[0]), order[1]);
  assert.equal(cycleNext(tree, order[2]), order[0]);
  assert.equal(cycleNext(tree, order[0], -1), order[2]);
});
