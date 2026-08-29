import { test } from "node:test";
import assert from "node:assert/strict";
import * as ctl from "../src/core/controller.mjs";

const screen = { x: 0, y: 0, width: 1000, height: 600 };
const WS = 1;
const OUT = "eDP-1";
const OTHER = "HDMI-1";

function staged(...pairs) {
  const c = ctl.createController({ gap: 0 });
  for (const [id, appId] of pairs) ctl.addWindow(c, WS, OUT, id, { appId });
  ctl.switchMode(c, WS, OUT, "stage", { screen });
  return c;
}
const layout = (c, ws = WS, out = OUT) => ctl.computeLayout(c, ws, out, { screen });
const visible = (c, ws = WS, out = OUT) =>
  layout(c, ws, out).windows.filter((w) => w.visible).map((w) => w.id);
const stageShape = (c) =>
  ctl.stages(c, WS, OUT).stages.map((s) => s.windowIds.join("+"));

test("cycling stages steps through the rail and wraps", () => {
  const c = staged(["a", "one"], ["b", "two"], ["d", "three"]);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    ctl.cycleStage(c, WS, OUT, 1);
    seen.push(visible(c)[0]);
  }
  assert.equal(new Set(seen).size, 3, "visits all three stages");
  assert.equal(seen[3], seen[0], "and wraps");
});

test("cycling with one stage is a no-op, not a crash", () => {
  const c = staged(["a", "one"]);
  ctl.cycleStage(c, WS, OUT, 1);
  assert.deepEqual(visible(c), ["a"]);
});

test("a window can be pulled out onto a stage of its own", () => {
  const c = staged(["a", "same"], ["b", "same"]);
  assert.deepEqual(stageShape(c), ["a+b"], "same app starts grouped");
  ctl.moveWindowToNewStage(c, WS, OUT, "b");
  assert.deepEqual(stageShape(c).sort(), ["a", "b"]);
  assert.deepEqual(visible(c), ["b"], "and the new stage is the active one");
});

test("a window pulled out stays out across a mode round trip", () => {
  const c = staged(["a", "same"], ["b", "same"]);
  ctl.moveWindowToNewStage(c, WS, OUT, "b");
  ctl.switchMode(c, WS, OUT, "floating", { screen });
  ctl.switchMode(c, WS, OUT, "stage", { screen });
  assert.deepEqual(stageShape(c).sort(), ["a", "b"]);
});

test("a window can be grouped onto an existing stage", () => {
  const c = staged(["a", "one"], ["b", "two"]);
  const target = ctl.stages(c, WS, OUT).stages[0].id;
  assert.equal(ctl.moveWindowToStage(c, WS, OUT, "b", target), true);
  assert.deepEqual(stageShape(c), ["a+b"]);
});

test("grouping onto a stage that does not exist is refused", () => {
  const c = staged(["a", "one"]);
  assert.equal(ctl.moveWindowToStage(c, WS, OUT, "a", 999), false);
});

test("merging folds the active stage into its neighbour", () => {
  const c = staged(["a", "one"], ["b", "two"]);
  assert.equal(ctl.mergeActiveStage(c, WS, OUT, 1), true);
  assert.equal(ctl.stages(c, WS, OUT).stages.length, 1);
  assert.deepEqual(visible(c).sort(), ["a", "b"]);
});

test("merging with only one stage is refused", () => {
  const c = staged(["a", "one"]);
  assert.equal(ctl.mergeActiveStage(c, WS, OUT, 1), false);
});

test("a merged grouping survives leaving stage and coming back", () => {
  const c = staged(["a", "one"], ["b", "two"]);
  ctl.mergeActiveStage(c, WS, OUT, 1);
  ctl.switchMode(c, WS, OUT, "floating", { screen });
  ctl.switchMode(c, WS, OUT, "stage", { screen });
  assert.equal(ctl.stages(c, WS, OUT).stages.length, 1);
});

// --- moving between monitors -------------------------------------------------

test("a window can be moved to another monitor", () => {
  const c = ctl.createController({ gap: 0 });
  ctl.addWindow(c, WS, OUT, "a");
  ctl.addWindow(c, WS, OUT, "b");
  const landed = ctl.moveWindowToOutput(c, OUT, OTHER, "b", { screen });
  assert.deepEqual(landed, { outputId: OTHER, workspaceId: 1 });
  assert.deepEqual(ctl.windows(c, WS, OUT), ["a"]);
  assert.deepEqual(ctl.windows(c, 1, OTHER), ["b"]);
});

test("a window lands on whatever workspace that monitor is showing", () => {
  const c = ctl.createController({ gap: 0 });
  ctl.addWindow(c, WS, OUT, "a");
  ctl.setCurrentWorkspace(c, OTHER, 5);
  const landed = ctl.moveWindowToOutput(c, OUT, OTHER, "a", { screen });
  assert.equal(landed.workspaceId, 5);
  assert.deepEqual(ctl.windows(c, 5, OTHER), ["a"]);
});

test("moving to the monitor it is already on is a no-op", () => {
  const c = ctl.createController({ gap: 0 });
  ctl.addWindow(c, WS, OUT, "a");
  assert.equal(ctl.moveWindowToOutput(c, OUT, OUT, "a", { screen }), null);
});

test("a window moved between monitors joins the target's mode", () => {
  const c = ctl.createController({ gap: 0 });
  ctl.addWindow(c, WS, OUT, "a");
  ctl.addWindow(c, 1, OTHER, "b");
  ctl.switchMode(c, 1, OTHER, "tiling", { screen });
  ctl.moveWindowToOutput(c, OUT, OTHER, "a", { screen });
  const res = layout(c, 1, OTHER);
  assert.deepEqual(res.windows.map((w) => w.id).sort(), ["a", "b"]);
  assert.equal(res.windows[0].rect.width + res.windows[1].rect.width, screen.width);
});

test("moving a window that is not there is refused", () => {
  const c = ctl.createController({ gap: 0 });
  assert.equal(ctl.moveWindowToOutput(c, OUT, OTHER, "ghost", { screen }), null);
});
