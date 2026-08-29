import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createStageState,
  createStage,
  renameStage,
  assignWindow,
  ungroupWindow,
  stageOf,
  mergeStages,
  switchStage,
} from "../src/core/stage.mjs";

function devCommsState() {
  let s = createStageState();
  s = createStage(s, "Development");
  s = createStage(s, "Comms");
  s = assignWindow(s, "vscode", 1);
  s = assignWindow(s, "terminal", 1);
  s = assignWindow(s, "slack", 2);
  return s;
}

test("first created stage becomes active", () => {
  const s = devCommsState();
  assert.equal(s.activeId, 1);
});

test("window membership is exclusive — drag to another Stage moves it (PRD §14)", () => {
  let s = devCommsState();
  s = assignWindow(s, "vscode", 2);
  assert.equal(stageOf(s, "vscode").id, 2);
  assert.deepEqual(s.stages.find((x) => x.id === 1).windowIds, ["terminal"]);
});

test("switching stages reports windows to show and hide (drives the effect layer, PRD §15)", () => {
  const { state, show, hide } = switchStage(devCommsState(), 2);
  assert.equal(state.activeId, 2);
  assert.deepEqual(show, ["slack"]);
  assert.deepEqual(hide, ["vscode", "terminal"]);
});

test("switching to the already-active stage hides nothing", () => {
  const { show, hide } = switchStage(devCommsState(), 1);
  assert.deepEqual(show, ["vscode", "terminal"]);
  assert.deepEqual(hide, []);
});

test("merge moves windows and removes the source stage (PRD §14)", () => {
  let s = devCommsState();
  s = mergeStages(s, 2, 1);
  assert.equal(s.stages.length, 1);
  assert.deepEqual(s.stages[0].windowIds, ["vscode", "terminal", "slack"]);
});

test("merging the active stage moves activity to the target", () => {
  let s = devCommsState();
  s = switchStage(s, 2).state;
  s = mergeStages(s, 2, 1);
  assert.equal(s.activeId, 1);
});

test("stages can be named and renamed (PRD §14)", () => {
  let s = devCommsState();
  s = renameStage(s, 2, "Communication");
  assert.equal(s.stages.find((x) => x.id === 2).name, "Communication");
});

test("ungroup removes a window from all stages", () => {
  let s = devCommsState();
  s = ungroupWindow(s, "vscode");
  assert.equal(stageOf(s, "vscode"), null);
});

test("assigning to a missing stage throws", () => {
  assert.throws(() => assignWindow(devCommsState(), "x", 99));
});
