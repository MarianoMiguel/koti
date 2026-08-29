import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cascadePlacement,
  clampToScreen,
  computeFloating,
  fitsScreen,
  raiseWindow,
  CASCADE_STEP,
} from "../src/core/floating.mjs";

const screen = { x: 0, y: 0, width: 1000, height: 600 };

test("a never-seen window gets a default-sized rect at the work-area origin", () => {
  assert.deepEqual(cascadePlacement(screen, 0), { x: 0, y: 0, width: 600, height: 420 });
});

test("successive unplaced windows cascade so they do not stack exactly", () => {
  const a = cascadePlacement(screen, 0);
  const b = cascadePlacement(screen, 1);
  assert.equal(b.x - a.x, CASCADE_STEP);
  assert.equal(b.y - a.y, CASCADE_STEP);
});

test("the cascade wraps instead of walking windows off the screen", () => {
  assert.deepEqual(cascadePlacement(screen, 8), cascadePlacement(screen, 0));
});

test("cascade honours an explicit size hint", () => {
  assert.deepEqual(cascadePlacement(screen, 0, { size: { width: 300, height: 200 } }), {
    x: 0, y: 0, width: 300, height: 200,
  });
});

test("clamping slides an off-screen window back into the work area", () => {
  assert.deepEqual(clampToScreen({ x: 900, y: 550, width: 400, height: 300 }, screen), {
    x: 600, y: 300, width: 400, height: 300,
  });
});

test("clamping shrinks a window larger than the screen", () => {
  assert.deepEqual(clampToScreen({ x: -50, y: -50, width: 2000, height: 900 }, screen), screen);
});

test("clamping respects a non-zero work area (panels, second output)", () => {
  const workArea = { x: 100, y: 40, width: 800, height: 500 };
  assert.deepEqual(clampToScreen({ x: 0, y: 0, width: 200, height: 100 }, workArea), {
    x: 100, y: 40, width: 200, height: 100,
  });
});

test("fitsScreen rejects geometry from an output that is gone", () => {
  assert.equal(fitsScreen({ x: 1400, y: 0, width: 300, height: 200 }, screen), false);
  assert.equal(fitsScreen({ x: 900, y: 0, width: 300, height: 200 }, screen), true);
  assert.equal(fitsScreen(undefined, screen), false);
});

test("computeFloating restores remembered geometry (PRD §17 round trip)", () => {
  const remembered = new Map([["a", { x: 120, y: 80, width: 400, height: 300 }]]);
  assert.deepEqual(computeFloating({ screen, windows: ["a"], remembered }).get("a"), {
    x: 120, y: 80, width: 400, height: 300,
  });
});

test("computeFloating cascades only the windows it has never placed", () => {
  const remembered = { b: { x: 200, y: 100, width: 300, height: 200 } };
  const rects = computeFloating({ screen, windows: ["a", "b", "c"], remembered });
  assert.deepEqual(rects.get("b"), { x: 200, y: 100, width: 300, height: 200 });
  assert.equal(rects.get("a").x, 0);
  assert.equal(rects.get("c").x, CASCADE_STEP);
});

test("computeFloating re-homes geometry remembered from a detached output", () => {
  const remembered = new Map([["a", { x: 2000, y: 0, width: 400, height: 300 }]]);
  assert.deepEqual(computeFloating({ screen, windows: ["a"], remembered }).get("a"), {
    x: 0, y: 0, width: 600, height: 420,
  });
});

test("raiseWindow moves a window to the top without duplicating it", () => {
  assert.deepEqual(raiseWindow(["a", "b", "c"], "a"), ["b", "c", "a"]);
  assert.deepEqual(raiseWindow(["a", "b"], "z"), ["a", "b", "z"]);
});

test("raiseWindow is pure", () => {
  const order = ["a", "b"];
  raiseWindow(order, "a");
  assert.deepEqual(order, ["a", "b"]);
});
