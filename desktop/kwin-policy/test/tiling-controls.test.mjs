import { test } from "node:test";
import assert from "node:assert/strict";
import * as ctl from "../src/core/controller.mjs";

const screen = { x: 0, y: 0, width: 1000, height: 600 };
const WS = 1;
const OUT = "eDP-1";

function tiled(...ids) {
  const c = ctl.createController({ gap: 0 });
  for (const id of ids) ctl.addWindow(c, WS, OUT, id);
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  return c;
}
const layout = (c) => ctl.computeLayout(c, WS, OUT, { screen });
const rectOf = (c, id) => layout(c).windows.find((w) => w.id === id)?.rect;
const visible = (c) => layout(c).windows.filter((w) => w.visible).map((w) => w.id);

// --- policies ---------------------------------------------------------------

test("tiling starts on the automatic policy", () => {
  assert.equal(ctl.tilingPolicy(tiled("a"), WS, OUT), "automatic");
});

test("cycling the policy walks every policy and wraps", () => {
  const c = tiled("a", "b");
  const seen = [];
  for (let i = 0; i < ctl.TILING_POLICIES.length + 1; i++) {
    seen.push(ctl.cycleTilingPolicy(c, WS, OUT, 1));
  }
  assert.deepEqual(seen.slice(0, ctl.TILING_POLICIES.length).sort(), [...ctl.TILING_POLICIES].sort());
  assert.equal(seen[ctl.TILING_POLICIES.length], seen[0], "and wraps back round");
});

test("the columns policy gives every window an equal column", () => {
  const c = tiled("a", "b", "c");
  ctl.setTilingPolicy(c, WS, OUT, "columns");
  const rects = layout(c).windows.map((w) => w.rect);
  for (const r of rects) assert.equal(r.height, screen.height);
  assert.equal(rects.reduce((sum, r) => sum + r.width, 0), screen.width);
});

test("the rows policy gives every window an equal row", () => {
  const c = tiled("a", "b", "c");
  ctl.setTilingPolicy(c, WS, OUT, "rows");
  const rects = layout(c).windows.map((w) => w.rect);
  for (const r of rects) assert.equal(r.width, screen.width);
  assert.equal(rects.reduce((sum, r) => sum + r.height, 0), screen.height);
});

test("main-stack honours the main ratio", () => {
  const c = tiled("a", "b", "c");
  ctl.setTilingPolicy(c, WS, OUT, "main-stack");
  const order = layout(c).windows.map((w) => w.id);
  const main = rectOf(c, order[0]);
  assert.equal(main.width, 500);
  ctl.resizeActive(c, WS, OUT, order[0], "right", 100, { screen });
  assert.equal(rectOf(c, order[0]).width, 600, "keyboard resize moved the main column");
});

test("an unknown policy is refused", () => {
  assert.throws(() => ctl.setTilingPolicy(tiled("a"), WS, OUT, "spiral"), RangeError);
});

test("changing policy keeps every window on screen", () => {
  const c = tiled("a", "b", "c", "d");
  for (const policy of ctl.TILING_POLICIES) {
    ctl.setTilingPolicy(c, WS, OUT, policy);
    assert.deepEqual(visible(c).sort(), ["a", "b", "c", "d"], `${policy} dropped a window`);
  }
});

// --- split orientation, master, cycling -------------------------------------

test("toggling the split orientation restacks the pair", () => {
  const c = tiled("a", "b");
  assert.equal(rectOf(c, "a").width, 500);
  ctl.toggleSplitOrientation(c, WS, OUT, "b");
  assert.equal(rectOf(c, "a").width, 1000, "now stacked");
});

test("swapWithMaster moves a window into the first tile", () => {
  const c = tiled("a", "b", "c");
  const order = layout(c).windows.map((w) => w.id);
  ctl.swapWithMaster(c, WS, OUT, order[2]);
  assert.equal(layout(c).windows[0].id, order[2]);
});

test("cycleTile walks tile order and wraps", () => {
  const c = tiled("a", "b", "c");
  const order = layout(c).windows.map((w) => w.id);
  assert.equal(ctl.cycleTile(c, WS, OUT, order[0]), order[1]);
  assert.equal(ctl.cycleTile(c, WS, OUT, order[2]), order[0]);
});

test("tiling controls are refused outside tiling mode", () => {
  const c = tiled("a", "b");
  ctl.switchMode(c, WS, OUT, "floating", { screen });
  assert.equal(ctl.cycleTile(c, WS, OUT, "a"), null);
});

// --- floating on top of the tiling ------------------------------------------

test("a window lifted out of the tiling stops taking a tile", () => {
  const c = tiled("a", "b");
  ctl.toggleWindowFloating(c, WS, OUT, "b", { screen });
  assert.equal(ctl.isWindowFloating(c, WS, OUT, "b"), true);
  assert.deepEqual(rectOf(c, "a"), screen, "a takes the whole tiling area");
  assert.ok(visible(c).includes("b"), "and b is still on screen, floating above");
});

test("dropping a window back in gives it a tile again", () => {
  const c = tiled("a", "b");
  ctl.toggleWindowFloating(c, WS, OUT, "b", { screen });
  ctl.toggleWindowFloating(c, WS, OUT, "b", { screen });
  assert.equal(ctl.isWindowFloating(c, WS, OUT, "b"), false);
  assert.equal(rectOf(c, "a").width, 500);
  assert.equal(rectOf(c, "b").width, 500);
});

test("a lifted window keeps the geometry it had before (PRD §17)", () => {
  const c = ctl.createController({ gap: 0 });
  const geometry = { x: 60, y: 40, width: 300, height: 200 };
  ctl.addWindow(c, WS, OUT, "a", { geometry });
  ctl.addWindow(c, WS, OUT, "b");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  ctl.toggleWindowFloating(c, WS, OUT, "a", { screen });
  assert.deepEqual(rectOf(c, "a"), geometry);
});

test("lifting every window out leaves an empty tiling, not a broken one", () => {
  const c = tiled("a", "b");
  ctl.toggleWindowFloating(c, WS, OUT, "a", { screen });
  ctl.toggleWindowFloating(c, WS, OUT, "b", { screen });
  assert.deepEqual(visible(c).sort(), ["a", "b"]);
});

// --- fullscreen -------------------------------------------------------------

test("fullscreen gives one window the whole output", () => {
  const c = tiled("a", "b", "c");
  ctl.toggleFullScreen(c, WS, OUT, "b");
  assert.deepEqual(rectOf(c, "b"), screen);
  // It covers rather than hides — the others keep their places underneath, so
  // leaving fullscreen is instant instead of un-minimizing everything.
  assert.deepEqual(visible(c).sort(), ["a", "b", "c"]);
});

test("fullscreen toggles back to the layout it interrupted", () => {
  const c = tiled("a", "b");
  const before = layout(c);
  ctl.toggleFullScreen(c, WS, OUT, "b");
  ctl.toggleFullScreen(c, WS, OUT, "b");
  assert.deepEqual(layout(c), before);
});

test("fullscreen works in every mode", () => {
  for (const m of ctl.MODES) {
    const c = ctl.createController({ gap: 0 });
    ctl.addWindow(c, WS, OUT, "a", { appId: "one" });
    ctl.addWindow(c, WS, OUT, "b", { appId: "two" });
    ctl.switchMode(c, WS, OUT, m, { screen });
    ctl.toggleFullScreen(c, WS, OUT, "a");
    assert.deepEqual(rectOf(c, "a"), screen, `${m}: fullscreen should fill the screen`);
    assert.ok(visible(c).includes("a"), `${m}: the fullscreen window must be visible`);
  }
});

test("closing the fullscreen window releases fullscreen", () => {
  const c = tiled("a", "b");
  ctl.toggleFullScreen(c, WS, OUT, "a");
  ctl.removeWindow(c, WS, OUT, "a");
  assert.equal(ctl.fullScreenWindow(c, WS, OUT), null);
  assert.deepEqual(visible(c), ["b"]);
});

test("minimizing the fullscreen window leaves the layout to the others", () => {
  const c = tiled("a", "b");
  ctl.toggleFullScreen(c, WS, OUT, "a");
  ctl.setExcluded(c, WS, OUT, "a", true);
  assert.deepEqual(visible(c), ["b"]);
  assert.deepEqual(rectOf(c, "b"), screen, "b gets the whole tiling area");
});

// --- keyboard resize --------------------------------------------------------

test("keyboard resize drags the split under the window", () => {
  const c = tiled("a", "b");
  ctl.resizeActive(c, WS, OUT, "a", "right", 100, { screen });
  assert.equal(rectOf(c, "a").width, 600);
  assert.equal(rectOf(c, "b").width, 400);
});

test("keyboard resize sets a column width in scrolling mode", () => {
  const c = ctl.createController({ gap: 0 });
  ctl.addWindow(c, WS, OUT, "a");
  ctl.addWindow(c, WS, OUT, "b");
  ctl.switchMode(c, WS, OUT, "scrolling", { screen });
  ctl.resizeActive(c, WS, OUT, "a", "right", 120, { screen });
  assert.equal(rectOf(c, "a").width, 620);
});

test("state added by the tiling controls survives a round trip", () => {
  const c = tiled("a", "b", "c");
  ctl.setTilingPolicy(c, WS, OUT, "main-stack");
  ctl.toggleWindowFloating(c, WS, OUT, "c", { screen });
  ctl.resizeActive(c, WS, OUT, "a", "right", 80, { screen });
  const restored = ctl.deserialize(ctl.serialize(c));
  assert.equal(ctl.tilingPolicy(restored, WS, OUT), "main-stack");
  assert.equal(ctl.isWindowFloating(restored, WS, OUT, "c"), true);
  assert.deepEqual(
    ctl.computeLayout(restored, WS, OUT, { screen }), layout(c),
  );
});
