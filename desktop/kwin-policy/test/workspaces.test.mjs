import { test } from "node:test";
import assert from "node:assert/strict";
import * as ctl from "../src/core/controller.mjs";

const screen = { x: 0, y: 0, width: 1000, height: 600 };
const LAPTOP = "eDP-1";
const EXTERNAL = "HDMI-1";

function controller() {
  return ctl.createController({ gap: 0, workspaceCount: 9 });
}

const layoutOn = (c, ws, out) => ctl.computeLayout(c, ws, out, { screen });
const idsOn = (c, ws, out) => layoutOn(c, ws, out).windows.map((w) => w.id);

test("every output starts on workspace 1", () => {
  const c = controller();
  assert.equal(ctl.currentWorkspace(c, LAPTOP), 1);
  assert.equal(ctl.currentWorkspace(c, EXTERNAL), 1);
});

test("switching workspace on one monitor leaves the other alone (hyprland/niri)", () => {
  const c = controller();
  ctl.setCurrentWorkspace(c, LAPTOP, 3);
  assert.equal(ctl.currentWorkspace(c, LAPTOP), 3);
  assert.equal(ctl.currentWorkspace(c, EXTERNAL), 1, "the external monitor must not follow");
});

test("workspace numbers are clamped, never out of range", () => {
  const c = controller();
  assert.equal(ctl.setCurrentWorkspace(c, LAPTOP, 0), 1);
  assert.equal(ctl.setCurrentWorkspace(c, LAPTOP, 99), 9);
  assert.equal(ctl.setCurrentWorkspace(c, LAPTOP, -5), 1);
});

test("cycling wraps around at both ends", () => {
  const c = controller();
  ctl.setCurrentWorkspace(c, LAPTOP, 9);
  assert.equal(ctl.cycleWorkspace(c, LAPTOP, 1), 1, "9 → 1");
  assert.equal(ctl.cycleWorkspace(c, LAPTOP, -1), 9, "1 → 9");
});

test("cycling can be told not to wrap", () => {
  const c = controller();
  assert.equal(ctl.cycleWorkspace(c, LAPTOP, -1, { wrap: false }), 1);
  ctl.setCurrentWorkspace(c, LAPTOP, 9);
  assert.equal(ctl.cycleWorkspace(c, LAPTOP, 1, { wrap: false }), 9);
});

test("each workspace holds its own windows", () => {
  const c = controller();
  ctl.addWindow(c, 1, LAPTOP, "a");
  ctl.addWindow(c, 2, LAPTOP, "b");
  assert.deepEqual(idsOn(c, 1, LAPTOP), ["a"]);
  assert.deepEqual(idsOn(c, 2, LAPTOP), ["b"]);
});

test("each workspace keeps its own mode", () => {
  const c = controller();
  ctl.addWindow(c, 1, LAPTOP, "a");
  ctl.addWindow(c, 2, LAPTOP, "b");
  ctl.switchMode(c, 1, LAPTOP, "tiling", { screen });
  assert.equal(ctl.mode(c, 1, LAPTOP), "tiling");
  assert.equal(ctl.mode(c, 2, LAPTOP), "floating");
});

test("the same workspace number on two monitors is two different workspaces", () => {
  const c = controller();
  ctl.addWindow(c, 1, LAPTOP, "a");
  ctl.addWindow(c, 1, EXTERNAL, "b");
  assert.deepEqual(idsOn(c, 1, LAPTOP), ["a"]);
  assert.deepEqual(idsOn(c, 1, EXTERNAL), ["b"]);
});

test("moving a window to another workspace takes it off the old one", () => {
  const c = controller();
  ctl.addWindow(c, 1, LAPTOP, "a");
  ctl.addWindow(c, 1, LAPTOP, "b");
  assert.equal(ctl.moveWindowToWorkspace(c, LAPTOP, "b", 4, { screen }), 4);
  assert.deepEqual(idsOn(c, 1, LAPTOP), ["a"]);
  assert.deepEqual(idsOn(c, 4, LAPTOP), ["b"]);
  assert.equal(ctl.workspaceOf(c, LAPTOP, "b"), 4);
});

test("a moved window keeps what PRD §17 remembers about it", () => {
  const c = controller();
  const geometry = { x: 120, y: 80, width: 400, height: 300 };
  ctl.addWindow(c, 1, LAPTOP, "a", { geometry });
  ctl.moveWindowToWorkspace(c, LAPTOP, "a", 2, { screen });
  const placed = layoutOn(c, 2, LAPTOP).windows.find((w) => w.id === "a");
  assert.deepEqual(placed.rect, geometry, "its floating geometry came with it");
});

test("a window moved into a tiling workspace joins that layout", () => {
  const c = controller();
  ctl.addWindow(c, 1, LAPTOP, "a");
  ctl.addWindow(c, 2, LAPTOP, "b");
  ctl.switchMode(c, 2, LAPTOP, "tiling", { screen });
  ctl.moveWindowToWorkspace(c, LAPTOP, "a", 2, { screen });
  const res = layoutOn(c, 2, LAPTOP);
  assert.deepEqual(res.windows.map((w) => w.id).sort(), ["a", "b"]);
  const [ra, rb] = ["a", "b"].map((id) => res.windows.find((w) => w.id === id).rect);
  assert.equal(ra.width + rb.width, screen.width, "and the tiles divide the screen");
});

test("moving the last window out leaves the old workspace empty and valid", () => {
  const c = controller();
  ctl.addWindow(c, 1, LAPTOP, "a");
  ctl.switchMode(c, 1, LAPTOP, "tiling", { screen });
  ctl.moveWindowToWorkspace(c, LAPTOP, "a", 2, { screen });
  assert.deepEqual(layoutOn(c, 1, LAPTOP).windows, []);
});

test("moving a window to the workspace it is already on is a no-op", () => {
  const c = controller();
  ctl.addWindow(c, 1, LAPTOP, "a");
  assert.equal(ctl.moveWindowToWorkspace(c, LAPTOP, "a", 1, { screen }), null);
  assert.deepEqual(idsOn(c, 1, LAPTOP), ["a"]);
});

test("moving a window that does not exist is refused, not guessed at", () => {
  const c = controller();
  assert.equal(ctl.moveWindowToWorkspace(c, LAPTOP, "ghost", 2, { screen }), null);
});

test("a moved window's target is clamped like any other", () => {
  const c = controller();
  ctl.addWindow(c, 1, LAPTOP, "a");
  assert.equal(ctl.moveWindowToWorkspace(c, LAPTOP, "a", 999, { screen }), 9);
});

test("the summary tells an indicator what to draw", () => {
  const c = controller();
  ctl.addWindow(c, 1, LAPTOP, "a");
  ctl.addWindow(c, 3, LAPTOP, "b");
  ctl.setCurrentWorkspace(c, LAPTOP, 3);
  const summary = ctl.workspaceSummary(c, LAPTOP);
  assert.equal(summary.length, 9);
  assert.deepEqual(
    summary.filter((w) => w.occupied).map((w) => w.index), [1, 3],
  );
  assert.equal(summary.find((w) => w.active).index, 3);
});

test("the summary does not count minimized windows as occupying a workspace", () => {
  const c = controller();
  ctl.addWindow(c, 2, LAPTOP, "a");
  ctl.setExcluded(c, 2, LAPTOP, "a", true);
  assert.equal(ctl.workspaceSummary(c, LAPTOP)[1].occupied, false);
});

test("workspace state survives a serialize round trip", () => {
  const c = controller();
  ctl.addWindow(c, 1, LAPTOP, "a");
  ctl.addWindow(c, 5, LAPTOP, "b");
  ctl.setCurrentWorkspace(c, LAPTOP, 5);
  ctl.setCurrentWorkspace(c, EXTERNAL, 2);
  const restored = ctl.deserialize(ctl.serialize(c));
  assert.equal(ctl.currentWorkspace(restored, LAPTOP), 5);
  assert.equal(ctl.currentWorkspace(restored, EXTERNAL), 2);
  assert.deepEqual(idsOn(restored, 5, LAPTOP), ["b"]);
});

test("workspaces work identically in all four modes", () => {
  for (const m of ctl.MODES) {
    const c = controller();
    ctl.addWindow(c, 1, LAPTOP, "a", { appId: "one" });
    ctl.addWindow(c, 1, LAPTOP, "b", { appId: "two" });
    ctl.switchMode(c, 1, LAPTOP, m, { screen });
    ctl.switchMode(c, 2, LAPTOP, m, { screen });
    ctl.moveWindowToWorkspace(c, LAPTOP, "b", 2, { screen });
    assert.deepEqual(idsOn(c, 1, LAPTOP), ["a"], `${m}: source workspace`);
    assert.deepEqual(idsOn(c, 2, LAPTOP), ["b"], `${m}: target workspace`);
  }
});
