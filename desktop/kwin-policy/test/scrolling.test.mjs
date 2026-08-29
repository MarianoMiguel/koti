import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createStrip,
  insertWindow,
  removeWindow,
  moveWindow,
  setWidth,
  focusWindow,
  neighbor,
  layout,
  stripWidth,
  windowStart,
} from "../src/core/scrolling.mjs";

const VIEWPORT = 1000;

function stripOf(...windows) {
  let s = createStrip();
  for (const [id, width] of windows) s = insertWindow(s, id, { width });
  return s;
}

test("windows keep stable widths as more are added (PRD §13)", () => {
  const s = stripOf(["browser", 600], ["editor", 800], ["term", 400]);
  assert.equal(s.windows.find((w) => w.id === "browser").width, 600);
  assert.equal(stripWidth(s), 1800);
});

test("new windows insert after an anchor and take focus", () => {
  let s = stripOf(["a", 500], ["c", 500]);
  s = insertWindow(s, "b", { width: 300, afterId: "a" });
  assert.deepEqual(s.windows.map((w) => w.id), ["a", "b", "c"]);
  assert.equal(s.focusId, "b");
});

test("focusing a window right of the viewport scrolls minimally (PRD §13)", () => {
  let s = stripOf(["a", 600], ["b", 800], ["c", 400]);
  s = focusWindow(s, "b", VIEWPORT);
  // b spans [600, 1400): minimal scroll puts its right edge at the viewport's
  assert.equal(s.viewportOffset, 400);
  const rects = layout(s, { y: 0, height: 600 });
  const b = rects.find((r) => r.id === "b");
  assert.equal(b.x, 200);
  assert.equal(b.x + b.width, VIEWPORT);
});

test("focusing a window left of the viewport aligns its left edge", () => {
  let s = stripOf(["a", 600], ["b", 800]);
  s = focusWindow(s, "b", VIEWPORT); // offset 400
  s = focusWindow(s, "a", VIEWPORT);
  assert.equal(s.viewportOffset, 0);
});

test("an already-visible window does not move the viewport", () => {
  let s = stripOf(["a", 300], ["b", 300]);
  s = focusWindow(s, "b", VIEWPORT);
  assert.equal(s.viewportOffset, 0);
});

test("a window wider than the viewport aligns its left edge", () => {
  let s = stripOf(["a", 400], ["wide", 1600]);
  s = focusWindow(s, "wide", VIEWPORT);
  assert.equal(s.viewportOffset, windowStart(s, "wide"));
});

test("removing the focused window focuses its successor, then predecessor at the end", () => {
  let s = stripOf(["a", 100], ["b", 100], ["c", 100]);
  s = focusWindow(s, "b", VIEWPORT);
  s = removeWindow(s, "b");
  assert.equal(s.focusId, "c");
  s = removeWindow(s, "c");
  assert.equal(s.focusId, "a");
});

test("reordering by drag maps to moveWindow", () => {
  let s = stripOf(["a", 100], ["b", 100], ["c", 100]);
  s = moveWindow(s, "a", 2);
  assert.deepEqual(s.windows.map((w) => w.id), ["b", "c", "a"]);
});

test("setWidth resizes one window only", () => {
  let s = stripOf(["a", 100], ["b", 100]);
  s = setWidth(s, "a", 250);
  assert.equal(stripWidth(s), 350);
});

test("keyboard navigation uses neighbors", () => {
  const s = stripOf(["a", 100], ["b", 100], ["c", 100]);
  assert.equal(neighbor(s, "b", -1), "a");
  assert.equal(neighbor(s, "b", 1), "c");
  assert.equal(neighbor(s, "a", -1), null);
});

test("layout positions windows contiguously from -viewportOffset", () => {
  let s = stripOf(["a", 600], ["b", 800], ["c", 400]);
  s = focusWindow(s, "c", VIEWPORT); // strip 1800, offset 800
  const [a, b, c] = layout(s, { y: 0, height: 600 });
  assert.equal(a.x, -800);
  assert.equal(b.x, -200);
  assert.equal(c.x, 600);
});
