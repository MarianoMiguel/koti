import { test } from "node:test";
import assert from "node:assert/strict";
import * as ctl from "../src/core/controller.mjs";

const screen = { x: 0, y: 0, width: 1000, height: 600 };
const WS = "d1";
const OUT = "eDP-1";

function withWindows(...ids) {
  const c = ctl.createController({ gap: 0 });
  for (const id of ids) ctl.addWindow(c, WS, OUT, id);
  return c;
}

const layout = (c) => ctl.computeLayout(c, WS, OUT, { screen });
const rectOf = (res, id) => res.windows.find((w) => w.id === id)?.rect;
const visibleIds = (res) => res.windows.filter((w) => w.visible).map((w) => w.id);

test("a fresh cell is Floating (PRD §11: the default)", () => {
  assert.equal(ctl.mode(ctl.createController(), WS, OUT), "floating");
});

test("floating leaves windows where KWin put them", () => {
  const c = ctl.createController();
  ctl.addWindow(c, WS, OUT, "a", { geometry: { x: 30, y: 40, width: 500, height: 300 } });
  assert.deepEqual(rectOf(layout(c), "a"), { x: 30, y: 40, width: 500, height: 300 });
});

test("switching to tiling fills the screen with the windows that exist", () => {
  const c = withWindows("a", "b");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  const res = layout(c);
  assert.equal(res.mode, "tiling");
  assert.deepEqual(rectOf(res, "a"), { x: 0, y: 0, width: 500, height: 600 });
  assert.deepEqual(rectOf(res, "b"), { x: 500, y: 0, width: 500, height: 600 });
});

test("tiling insets by the gap so windows do not touch the screen edge", () => {
  const c = ctl.createController({ gap: 10 });
  ctl.addWindow(c, WS, OUT, "a");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  assert.deepEqual(rectOf(layout(c), "a"), { x: 10, y: 10, width: 980, height: 580 });
});

test("a window opened while tiling joins the layout (PRD §12 automatic)", () => {
  const c = withWindows("a");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  ctl.addWindow(c, WS, OUT, "b");
  assert.deepEqual(visibleIds(layout(c)).sort(), ["a", "b"]);
});

test("closing a tiled window gives its space back", () => {
  const c = withWindows("a", "b");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  ctl.removeWindow(c, WS, OUT, "b");
  assert.deepEqual(rectOf(layout(c), "a"), screen);
});

test("Floating → Tiling → Floating restores the original geometry (PRD §17)", () => {
  const c = ctl.createController({ gap: 0 });
  const original = { x: 111, y: 222, width: 400, height: 300 };
  ctl.addWindow(c, WS, OUT, "a", { geometry: original });
  ctl.addWindow(c, WS, OUT, "b", { geometry: { x: 0, y: 0, width: 300, height: 200 } });
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  assert.notDeepEqual(rectOf(layout(c), "a"), original);
  ctl.switchMode(c, WS, OUT, "floating", { screen });
  assert.deepEqual(rectOf(layout(c), "a"), original);
});

test("Tiling → Floating → Tiling restores tile order, not arrival order", () => {
  const c = withWindows("a", "b", "c");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  const before = layout(c).windows.map((w) => w.id);
  ctl.switchMode(c, WS, OUT, "floating", { screen });
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  assert.deepEqual(layout(c).windows.map((w) => w.id), before);
});

test("scrolling gives windows stable widths rather than shrinking them (PRD §13)", () => {
  const c = withWindows("a", "b", "c");
  ctl.switchMode(c, WS, OUT, "scrolling", { screen });
  const res = layout(c);
  for (const id of ["a", "b", "c"]) assert.equal(rectOf(res, id).width, 500);
});

test("scrolling hides what is off the strip and shows what is on it", () => {
  const c = withWindows("a", "b", "c");
  ctl.switchMode(c, WS, OUT, "scrolling", { screen });
  assert.deepEqual(visibleIds(layout(c)), ["a", "b"]);
});

test("focus scrolls the viewport the minimum needed to reveal the window", () => {
  const c = withWindows("a", "b", "c");
  ctl.switchMode(c, WS, OUT, "scrolling", { screen });
  ctl.focusWindow(c, WS, OUT, "c", { screen });
  const res = layout(c);
  assert.deepEqual(visibleIds(res), ["b", "c"]);
  assert.equal(rectOf(res, "c").x + rectOf(res, "c").width, screen.width);
});

function withApps(...pairs) {
  const c = ctl.createController({ gap: 0 });
  for (const [id, appId] of pairs) ctl.addWindow(c, WS, OUT, id, { appId });
  ctl.switchMode(c, WS, OUT, "stage", { screen });
  return c;
}

const stageCount = (c) => ctl.stages(c, WS, OUT).stages.length;

test("stage gives each app its own stage and shows only the front one (PRD §14)", () => {
  const c = withApps(["a", "editor"], ["b", "browser"], ["d", "chat"]);
  assert.equal(stageCount(c), 3);
  // The last window added has focus, so its stage is the one on the canvas.
  assert.deepEqual(visibleIds(layout(c)), ["d"]);
});

test("a second window of the same app joins that app's stage", () => {
  const c = withApps(["a", "editor"], ["b", "editor"], ["d", "browser"]);
  assert.equal(stageCount(c), 2);
  ctl.focusWindow(c, WS, OUT, "a", { screen });
  assert.deepEqual(visibleIds(layout(c)).sort(), ["a", "b"]);
});

test("focusing a window off the canvas switches to its stage", () => {
  const c = withApps(["a", "editor"], ["b", "browser"]);
  assert.deepEqual(visibleIds(layout(c)), ["b"]);
  ctl.focusWindow(c, WS, OUT, "a", { screen });
  assert.deepEqual(visibleIds(layout(c)), ["a"]);
});

test("a stage's first window is centred and largest, the next peeks out behind it", () => {
  const c = withApps(["a", "editor"], ["b", "editor"]);
  const res = layout(c);
  const first = rectOf(res, "a");
  const second = rectOf(res, "b");
  assert.ok(first.width > second.width, "the first window should be the largest");
  // Centred horizontally on the canvas (one stage, so no rail).
  assert.equal(first.x + first.width / 2, screen.x + screen.width / 2);
  assert.ok(second.x < first.x && second.y < first.y, "the second peeks up-left");
});

test("clicking a window does not move or resize anything on the stage", () => {
  const c = withApps(["a", "editor"], ["b", "editor"]);
  const before = layout(c);
  ctl.focusWindow(c, WS, OUT, "a", { screen });
  assert.deepEqual(layout(c).windows, before.windows);
});

test("a window dragged on a stage stays where it was put", () => {
  const c = withApps(["a", "editor"], ["b", "editor"]);
  const from = rectOf(layout(c), "a");
  // Somewhere the window actually fits — a full-canvas window cannot move far.
  const to = { x: 60, y: 40, width: from.width, height: from.height };
  ctl.applyUserGeometry(c, WS, OUT, "a", { from, to, cursor: { x: 200, y: 150 }, screen });
  assert.deepEqual(rectOf(layout(c), "a"), to);
  // …and still after switching away and back.
  ctl.switchMode(c, WS, OUT, "floating", { screen });
  ctl.switchMode(c, WS, OUT, "stage", { screen });
  assert.deepEqual(rectOf(layout(c), "a"), to);
});

test("resizing on a stage is kept too", () => {
  const c = withApps(["a", "editor"]);
  const from = rectOf(layout(c), "a");
  const to = { x: from.x, y: from.y, width: 300, height: 200 };
  ctl.applyUserGeometry(c, WS, OUT, "a", { from, to, screen });
  assert.deepEqual(rectOf(layout(c), "a"), to);
});

test("dragging a tile onto another tile's left half splits it there (PRD §12)", () => {
  const c = withWindows("a", "b", "c");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  const target = rectOf(layout(c), "a");
  const from = rectOf(layout(c), "c");
  // Drop c on the left edge of a's tile.
  const cursor = { x: target.x + target.width * 0.1, y: target.y + target.height / 2 };
  ctl.applyUserGeometry(c, WS, OUT, "c", {
    from, to: { ...from, x: from.x + 200, y: from.y + 20 }, cursor, screen,
  });
  const after = layout(c);
  assert.ok(rectOf(after, "c").x < rectOf(after, "a").x, "c should now sit left of a");
});

test("a drag that lands on no tile leaves the tiling alone", () => {
  const c = withWindows("a", "b");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  const before = layout(c);
  const from = rectOf(before, "a");
  ctl.applyUserGeometry(c, WS, OUT, "a", {
    from, to: { ...from, x: from.x + 50 }, cursor: { x: -500, y: -500 }, screen,
  });
  assert.deepEqual(layout(c), before);
});

test("dragging a tile's shared edge resizes the split, not the window alone", () => {
  const c = withWindows("a", "b");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  const from = rectOf(layout(c), "a");
  // Drag a's right edge 100px to the right.
  ctl.applyUserGeometry(c, WS, OUT, "a", {
    from, to: { ...from, width: from.width + 100 }, screen,
  });
  const after = layout(c);
  assert.equal(rectOf(after, "a").width, from.width + 100);
  // b gives up exactly what a gained — the split moved, nothing overlaps.
  assert.equal(rectOf(after, "b").x, rectOf(after, "a").x + rectOf(after, "a").width);
});

test("resizing in scrolling mode sets a width the strip then keeps (PRD §13)", () => {
  const c = withWindows("a", "b", "c");
  ctl.switchMode(c, WS, OUT, "scrolling", { screen });
  const from = rectOf(layout(c), "a");
  ctl.applyUserGeometry(c, WS, OUT, "a", {
    from, to: { ...from, width: 300 }, screen,
  });
  const after = layout(c);
  assert.equal(rectOf(after, "a").width, 300);
  assert.equal(rectOf(after, "b").width, 500, "other widths are untouched");
  assert.equal(rectOf(after, "b").x, 300, "b follows a on the strip");
});

test("dragging along the strip reorders it", () => {
  const c = withWindows("a", "b", "c");
  ctl.switchMode(c, WS, OUT, "scrolling", { screen });
  const from = rectOf(layout(c), "a");
  // Drop a past the midpoint of b (b spans 500–1000, so 800 is its right half).
  ctl.applyUserGeometry(c, WS, OUT, "a", {
    from, to: { ...from, x: from.x + 600 }, cursor: { x: 800, y: 100 }, screen,
  });
  assert.deepEqual(layout(c).windows.map((w) => w.id), ["b", "a", "c"]);
});

test("dropping a window back where it already was changes nothing", () => {
  const c = withWindows("a", "b", "c");
  ctl.switchMode(c, WS, OUT, "scrolling", { screen });
  const from = rectOf(layout(c), "a");
  ctl.applyUserGeometry(c, WS, OUT, "a", {
    from, to: { ...from, x: from.x + 100 }, cursor: { x: 600, y: 100 }, screen,
  });
  assert.deepEqual(layout(c).windows.map((w) => w.id), ["a", "b", "c"]);
});

test("a drag in floating mode is simply the new geometry", () => {
  const c = withWindows("a");
  const to = { x: 10, y: 20, width: 300, height: 200 };
  ctl.applyUserGeometry(c, WS, OUT, "a", { from: { x: 0, y: 0, width: 300, height: 200 }, to, screen });
  assert.deepEqual(rectOf(layout(c), "a"), to);
});

test("the rail takes no space until there is a second stage", () => {
  const one = withApps(["a", "editor"]);
  assert.equal(rectOf(layout(one), "a").x, 40); // centred at 92% of a 1000px screen
});

test("a staged window is centred on the screen even when the rail is reserved", () => {
  const two = withApps(["a", "editor"], ["b", "browser"]);
  const rect = rectOf(layout(two), "b");
  const rail = Math.round(screen.width * 0.16);
  assert.equal(rect.x + rect.width / 2, screen.x + screen.width / 2, "centred on the screen");
  assert.ok(rect.x >= rail, "and still clear of the rail");
});

test("closing a window takes its now-empty stage with it", () => {
  const c = withApps(["a", "editor"], ["b", "browser"]);
  assert.equal(stageCount(c), 2);
  ctl.removeWindow(c, WS, OUT, "b");
  layout(c);
  assert.equal(stageCount(c), 1);
  assert.deepEqual(visibleIds(layout(c)), ["a"]);
});

test("a stage the user created but has not filled is not pruned", () => {
  const c = withApps(["a", "editor"]);
  ctl.newStage(c, WS, OUT, "Comms");
  layout(c);
  assert.equal(stageCount(c), 2);
});

test("stage membership survives a round trip out of Stage and back (PRD §17)", () => {
  const c = withApps(["a", "editor"], ["b", "browser"]);
  ctl.focusWindow(c, WS, OUT, "a", { screen });
  const before = ctl.stages(c, WS, OUT).stages.map((s) => s.windowIds.join("+")).sort();
  ctl.switchMode(c, WS, OUT, "floating", { screen });
  ctl.switchMode(c, WS, OUT, "stage", { screen });
  const after = ctl.stages(c, WS, OUT).stages.map((s) => s.windowIds.join("+")).sort();
  assert.deepEqual(after, before);
});

test("mode is tracked per workspace-per-output (PRD §10 v1.1)", () => {
  const c = ctl.createController();
  ctl.addWindow(c, WS, OUT, "a");
  ctl.addWindow(c, WS, "HDMI-1", "b");
  ctl.switchMode(c, WS, OUT, "scrolling", { screen });
  assert.equal(ctl.mode(c, WS, OUT), "scrolling");
  assert.equal(ctl.mode(c, WS, "HDMI-1"), "floating");
});

test("cycleMode walks the four modes and wraps", () => {
  const c = withWindows("a");
  const seen = [];
  for (let i = 0; i < 5; i++) {
    ctl.cycleMode(c, WS, OUT, 1, { screen });
    seen.push(ctl.mode(c, WS, OUT));
  }
  assert.deepEqual(seen, ["tiling", "scrolling", "stage", "floating", "tiling"]);
});

test("switchMode rejects a mode that does not exist", () => {
  assert.throws(() => ctl.switchMode(ctl.createController(), WS, OUT, "mosaic"), RangeError);
});

test("focus raises the window in the floating stacking order", () => {
  const c = withWindows("a", "b");
  ctl.focusWindow(c, WS, OUT, "a", { screen });
  assert.deepEqual(layout(c).stacking, ["b", "a"]);
});

test("state survives a serialize/deserialize round trip (PRD §10 persistence)", () => {
  const c = withWindows("a", "b", "c");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  const before = layout(c);
  const after = ctl.computeLayout(ctl.deserialize(ctl.serialize(c)), WS, OUT, { screen });
  assert.deepEqual(after, before);
});

test("a restored controller keeps each cell's mode", () => {
  const c = withWindows("a");
  ctl.switchMode(c, WS, OUT, "scrolling", { screen });
  assert.equal(ctl.mode(ctl.deserialize(ctl.serialize(c)), WS, OUT), "scrolling");
});

test("removing an unknown window is a no-op, not a crash", () => {
  const c = withWindows("a");
  ctl.removeWindow(c, WS, OUT, "ghost");
  assert.deepEqual(ctl.windows(c, WS, OUT), ["a"]);
});

test("adding the same window twice does not duplicate it", () => {
  const c = withWindows("a");
  ctl.addWindow(c, WS, OUT, "a");
  assert.deepEqual(ctl.windows(c, WS, OUT), ["a"]);
});

test("an empty cell lays out to nothing in every mode", () => {
  for (const m of ctl.MODES) {
    const c = ctl.createController();
    ctl.switchMode(c, WS, OUT, m, { screen });
    assert.deepEqual(layout(c).windows, [], `mode ${m}`);
  }
});

test("directional focus finds the tile to the right (PRD §12 keyboard nav)", () => {
  const c = withWindows("a", "b");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  assert.equal(ctl.focusNeighbour(c, WS, OUT, "a", "right", { screen }), "b");
  assert.equal(ctl.focusNeighbour(c, WS, OUT, "b", "right", { screen }), null);
});

test("directional focus is tiling-only", () => {
  const c = withWindows("a", "b");
  assert.equal(ctl.focusNeighbour(c, WS, OUT, "a", "right", { screen }), null);
});

test("moving a window swaps it with its neighbour", () => {
  const c = withWindows("a", "b");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  const before = rectOf(layout(c), "a");
  ctl.moveNeighbour(c, WS, OUT, "a", "right", { screen });
  assert.deepEqual(rectOf(layout(c), "b"), before);
});

test("moving at the screen edge leaves the layout alone", () => {
  const c = withWindows("a", "b");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  const before = layout(c);
  ctl.moveNeighbour(c, WS, OUT, "b", "right", { screen });
  assert.deepEqual(layout(c), before);
});

test("a minimized window gives up its tile (PRD §11: native minimize)", () => {
  const c = withWindows("a", "b");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  ctl.setExcluded(c, WS, OUT, "b", true);
  const res = layout(c);
  assert.deepEqual(res.windows.map((w) => w.id), ["a"]);
  assert.deepEqual(rectOf(res, "a"), screen);
});

test("restoring a minimized window puts it back in the layout", () => {
  const c = withWindows("a", "b");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  ctl.setExcluded(c, WS, OUT, "b", true);
  layout(c);
  ctl.setExcluded(c, WS, OUT, "b", false);
  assert.deepEqual(layout(c).windows.map((w) => w.id).sort(), ["a", "b"]);
});

test("a minimized window takes no slot on the scrolling strip", () => {
  const c = withWindows("a", "b", "c");
  ctl.switchMode(c, WS, OUT, "scrolling", { screen });
  ctl.setExcluded(c, WS, OUT, "a", true);
  const res = layout(c);
  assert.deepEqual(res.windows.map((w) => w.id), ["b", "c"]);
  assert.equal(rectOf(res, "b").x, 0, "b takes the front of the strip");
});

test("a minimized window is not put on a stage", () => {
  const c = withApps(["a", "editor"], ["b", "browser"]);
  ctl.setExcluded(c, WS, OUT, "b", true);
  layout(c);
  assert.equal(stageCount(c), 1);
  assert.deepEqual(visibleIds(layout(c)), ["a"]);
});

test("exclusion survives a serialize round trip", () => {
  const c = withWindows("a", "b");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  ctl.setExcluded(c, WS, OUT, "b", true);
  const restored = ctl.deserialize(ctl.serialize(c));
  assert.equal(ctl.isExcluded(restored, WS, OUT, "b"), true);
  assert.deepEqual(
    ctl.computeLayout(restored, WS, OUT, { screen }).windows.map((w) => w.id), ["a"],
  );
});
