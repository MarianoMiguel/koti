import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTiling, reorderWindow } from "../src/core/tiling.mjs";

const screen = { x: 0, y: 0, width: 1000, height: 600 };

test("one window fills the screen (PRD §12)", () => {
  const t = computeTiling({ screen, windows: ["a"] });
  assert.deepEqual(t.get("a"), screen);
});

test("two windows split into equal columns (PRD §12)", () => {
  const t = computeTiling({ screen, windows: ["a", "b"] });
  assert.deepEqual(t.get("a"), { x: 0, y: 0, width: 500, height: 600 });
  assert.deepEqual(t.get("b"), { x: 500, y: 0, width: 500, height: 600 });
});

test("three windows: main left, two stacked right (PRD §12)", () => {
  const t = computeTiling({ screen, windows: ["a", "b", "c"] });
  assert.deepEqual(t.get("a"), { x: 0, y: 0, width: 500, height: 600 });
  assert.deepEqual(t.get("b"), { x: 500, y: 0, width: 500, height: 300 });
  assert.deepEqual(t.get("c"), { x: 500, y: 300, width: 500, height: 300 });
});

test("columns policy gives N equal columns covering the screen", () => {
  const t = computeTiling({ screen, windows: ["a", "b", "c", "d"], policy: "columns" });
  const rects = ["a", "b", "c", "d"].map((id) => t.get(id));
  assert.equal(rects.reduce((s, r) => s + r.width, 0), screen.width);
  for (const r of rects) assert.equal(r.height, screen.height);
  for (let i = 1; i < rects.length; i++) assert.equal(rects[i].x, rects[i - 1].x + rects[i - 1].width);
});

test("rows policy stacks N equal rows", () => {
  const t = computeTiling({ screen, windows: ["a", "b", "c"], policy: "rows" });
  const rects = ["a", "b", "c"].map((id) => t.get(id));
  assert.equal(rects.reduce((s, r) => s + r.height, 0), screen.height);
  for (const r of rects) assert.equal(r.width, screen.width);
});

test("main-stack honors mainRatio", () => {
  const t = computeTiling({ screen, windows: ["a", "b", "c"], policy: "main-stack", mainRatio: 0.6 });
  assert.equal(t.get("a").width, 600);
  assert.equal(t.get("b").x, 600);
});

test("gaps are applied between tiles, not at screen edges", () => {
  const t = computeTiling({ screen, windows: ["a", "b"], gap: 10 });
  assert.equal(t.get("a").x, 0);
  assert.equal(t.get("a").width + 10 + t.get("b").width, screen.width);
  assert.equal(t.get("b").x, t.get("a").width + 10);
});

test("unknown policy throws", () => {
  assert.throws(() => computeTiling({ screen, windows: ["a"], policy: "spiral" }), RangeError);
});

test("reorderWindow moves within bounds and is pure", () => {
  const order = ["a", "b", "c"];
  assert.deepEqual(reorderWindow(order, "c", -2), ["c", "a", "b"]);
  assert.deepEqual(reorderWindow(order, "a", 5), ["b", "c", "a"]);
  assert.deepEqual(order, ["a", "b", "c"]);
});
