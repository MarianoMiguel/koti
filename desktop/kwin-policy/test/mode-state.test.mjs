import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MODES,
  createModeState,
  setMode,
  getMode,
  setWorkspaceDefault,
  rememberWindow,
  recallWindow,
  forgetWindow,
  serialize,
  deserialize,
} from "../src/core/mode-state.mjs";

test("floating is the default mode for new users (PRD §11)", () => {
  const ms = createModeState();
  assert.equal(getMode(ms, "ws1", "eDP-1"), "floating");
});

test("mode is per workspace-per-output (PRD v1.1 §10)", () => {
  const ms = createModeState();
  setMode(ms, "ws1", "eDP-1", "scrolling");
  assert.equal(getMode(ms, "ws1", "eDP-1"), "scrolling");
  assert.equal(getMode(ms, "ws1", "DP-3"), "floating"); // external monitor unaffected
});

test("workspace default covers newly attached outputs", () => {
  const ms = createModeState();
  setWorkspaceDefault(ms, "ws1", "tiling");
  assert.equal(getMode(ms, "ws1", "HDMI-1"), "tiling");
  setMode(ms, "ws1", "HDMI-1", "stage");
  assert.equal(getMode(ms, "ws1", "HDMI-1"), "stage"); // cell wins over default
});

test("all four PRD modes are valid; others are rejected", () => {
  const ms = createModeState();
  for (const m of MODES) setMode(ms, "ws", "out", m);
  assert.throws(() => setMode(ms, "ws", "out", "mosaic"), RangeError);
});

test("per-window memory accumulates and survives mode switches (PRD §17)", () => {
  const ms = createModeState();
  rememberWindow(ms, "w1", { floatingGeometry: { x: 10, y: 20, width: 800, height: 500 } });
  rememberWindow(ms, "w1", { scrollWidth: 720, lastFocus: 123 });
  assert.deepEqual(recallWindow(ms, "w1"), {
    floatingGeometry: { x: 10, y: 20, width: 800, height: 500 },
    scrollWidth: 720,
    lastFocus: 123,
  });
  forgetWindow(ms, "w1");
  assert.equal(recallWindow(ms, "w1"), null);
});

test("state round-trips through JSON for persistence (PRD §10)", () => {
  const ms = createModeState();
  setMode(ms, "ws1", "eDP-1", "scrolling");
  setWorkspaceDefault(ms, "ws2", "stage");
  rememberWindow(ms, "w1", { stageId: 2 });
  const back = deserialize(serialize(ms));
  assert.equal(getMode(back, "ws1", "eDP-1"), "scrolling");
  assert.equal(getMode(back, "ws2", "any"), "stage");
  assert.deepEqual(recallWindow(back, "w1"), { stageId: 2 });
});
