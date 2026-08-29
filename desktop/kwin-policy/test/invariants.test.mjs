/*
 * Cross-mode invariant fuzzing.
 *
 * The per-feature tests say each operation does what it should. This says the
 * *whole system* never reaches a broken state, whatever order things happen in
 * — which is the difference between a layout engine that works and one that
 * "kinda works". A seeded generator drives every operation in every mode
 * against every cell, and after each step every invariant is re-checked. A
 * failure prints the seed and the step, so it reproduces exactly.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as ctl from "../src/core/controller.mjs";

const SCREENS = [
  { x: 0, y: 0, width: 1920, height: 1080 },
  { x: 0, y: 29, width: 1920, height: 1117 }, // with a top bar, like the real one
  { x: 0, y: 0, width: 1000, height: 600 },
  { x: 100, y: 40, width: 800, height: 500 }, // offset work area
  { x: 0, y: 0, width: 400, height: 1200 }, // tall and narrow
];
const OUTPUTS = ["eDP-1", "HDMI-1"];
/** The gap the fuzzer builds its controller with; layouts are checked against it. */
const GAP = 8;
const APPS = ["editor", "browser", "chat", "terminal"];

/** Deterministic PRNG, so a failing seed replays exactly. */
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

function overlaps(a, b) {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height
  );
}

function within(rect, screen, slack = 0) {
  return (
    rect.x >= screen.x - slack &&
    rect.y >= screen.y - slack &&
    rect.x + rect.width <= screen.x + screen.width + slack &&
    rect.y + rect.height <= screen.y + screen.height + slack
  );
}

/** Everything that must be true of one cell, in whatever mode it is in. */
function checkCell(c, ws, out, screen, where) {
  const mode = ctl.mode(c, ws, out);
  const res = ctl.computeLayout(c, ws, out, { screen });
  const ids = res.windows.map((w) => w.id);
  const known = ctl.windows(c, ws, out);
  const live = known.filter((id) => !ctl.isExcluded(c, ws, out, id));

  assert.equal(new Set(ids).size, ids.length, `${where}: a window appears twice in the layout`);
  for (const id of ids) {
    assert.ok(known.includes(id), `${where}: layout returned unknown window ${id}`);
    assert.ok(!ctl.isExcluded(c, ws, out, id), `${where}: minimized ${id} was laid out`);
  }

  // Floating, tiling and scrolling place every live window. Stage deliberately
  // shows only the active stage, so it is the one mode that may return fewer.
  if (mode !== "stage") {
    assert.deepEqual(
      [...ids].sort(), [...live].sort(),
      `${where}: ${mode} must lay out exactly the live windows`,
    );
  } else {
    for (const id of ids) assert.ok(live.includes(id), `${where}: stage laid out a dead window`);
  }

  for (const placement of res.windows) {
    if (!placement.visible) continue;
    const r = placement.rect;
    assert.ok(r, `${where}: visible ${placement.id} has no rect`);
    assert.ok(
      Number.isFinite(r.x) && Number.isFinite(r.y) &&
      Number.isFinite(r.width) && Number.isFinite(r.height),
      `${where}: ${placement.id} has a non-finite rect ${JSON.stringify(r)}`,
    );
    assert.ok(r.width > 0 && r.height > 0, `${where}: ${placement.id} has an empty rect`);
  }

  const visible = res.windows.filter((w) => w.visible);

  const fullscreen = ctl.fullScreenWindow(c, ws, out);
  if (fullscreen !== null && live.includes(fullscreen)) {
    const placed = res.windows.find((w) => w.id === fullscreen);
    assert.ok(placed && placed.visible, `${where}: the fullscreen window must be visible`);
    assert.deepEqual(
      placed.rect, { ...screen },
      `${where}: fullscreen must take the whole output`,
    );
    // It covers the others rather than hiding them, so the per-mode geometry
    // checks below would see an intentional overlap. Nothing more to assert.
    return res;
  }

  if (mode === "tiling") {
    // Windows lifted out of the tiling float above it and are allowed to
    // overlap; only the tiled ones must partition the screen.
    const arranged = visible.filter((w) => !ctl.isWindowFloating(c, ws, out, w.id));
    for (const w of arranged) {
      assert.ok(
        within(w.rect, screen),
        `${where}: tile ${w.id} escaped the screen — ${JSON.stringify(w.rect)}`,
      );
    }
    for (let i = 0; i < arranged.length; i++) {
      for (let j = i + 1; j < arranged.length; j++) {
        assert.ok(
          !overlaps(arranged[i].rect, arranged[j].rect),
          `${where}: tiles ${arranged[i].id} and ${arranged[j].id} overlap`,
        );
      }
    }
  }

  if (mode === "scrolling") {
    // Columns sit shoulder to shoulder along the strip; the windows stacked
    // inside a column share its x and divide its height with no gaps.
    const cols = ctl.columns(c, ws, out);
    const placed = new Map(res.windows.map((w) => [w.id, w.rect]));
    assert.deepEqual(
      cols.flatMap((col) => col.windows).sort(), [...live].sort(),
      `${where}: the strip must hold exactly the live windows`,
    );

    let expectedX = null;
    for (const col of cols) {
      const first = placed.get(col.windows[0]);
      assert.ok(first, `${where}: column head ${col.windows[0]} was not placed`);
      if (expectedX !== null) {
        assert.equal(first.x, expectedX, `${where}: gap between columns on the strip`);
      }
      expectedX = first.x + first.width;

      let bottom = null;
      for (const id of col.windows) {
        const r = placed.get(id);
        assert.equal(r.x, first.x, `${where}: ${id} left its column`);
        assert.equal(r.width, col.width, `${where}: ${id} is not its column's width`);
        if (bottom !== null) {
          // Stacked windows are separated by exactly one gap — enough to read
          // as separate windows, and no more.
          assert.equal(r.y, bottom + GAP, `${where}: wrong spacing inside a column above ${id}`);
        }
        bottom = r.y + r.height;
      }
      if (col.windows.length) {
        assert.equal(bottom, screen.y + screen.height, `${where}: column does not fill the height`);
      }
    }

    for (const w of visible) {
      assert.ok(
        w.rect.x < screen.x + screen.width && w.rect.x + w.rect.width > screen.x,
        `${where}: ${w.id} is marked visible but is off the strip viewport`,
      );
    }
  }

  if (mode === "floating") {
    assert.equal(
      visible.length, res.windows.length,
      `${where}: floating hides nothing`,
    );
  }

  if (mode === "stage") {
    const stages = ctl.stages(c, ws, out);
    const active = stages.stages.find((s) => s.id === stages.activeId);
    const expected = (active ? active.windowIds : []).filter((id) => live.includes(id));
    assert.deepEqual(
      visible.map((w) => w.id).sort(), [...expected].sort(),
      `${where}: stage must show exactly the active stage`,
    );
    // No window may sit on two stages at once.
    const seen = new Set();
    for (const s of stages.stages) {
      for (const id of s.windowIds) {
        assert.ok(!seen.has(id), `${where}: ${id} is on two stages`);
        seen.add(id);
      }
    }
  }

  // Asking twice must give the same answer — layout is a function of state,
  // not a thing with side effects.
  assert.deepEqual(
    ctl.computeLayout(c, ws, out, { screen }), res,
    `${where}: computeLayout is not idempotent`,
  );

  return res;
}

/** Invariants that span the whole controller, not one cell. */
function checkGlobal(c, screen, where) {
  const homes = new Map();
  for (const out of OUTPUTS) {
    for (let ws = 1; ws <= 9; ws++) {
      for (const id of ctl.windows(c, ws, out)) {
        const at = `${out}#${ws}`;
        assert.ok(
          !homes.has(id),
          `${where}: ${id} is on both ${homes.get(id)} and ${at}`,
        );
        homes.set(id, at);
      }
      checkCell(c, ws, out, screen, `${where} ${out}#${ws}`);
    }
    const current = ctl.currentWorkspace(c, out);
    assert.ok(
      current >= 1 && current <= 9 && Number.isInteger(current),
      `${where}: ${out} is on workspace ${current}`,
    );
  }

  // Everything the controller holds must survive being written down and read
  // back — that is what makes the state persistable (PRD §10).
  const restored = ctl.deserialize(ctl.serialize(c));
  for (const out of OUTPUTS) {
    assert.equal(
      ctl.currentWorkspace(restored, out), ctl.currentWorkspace(c, out),
      `${where}: workspace lost in a round trip`,
    );
    for (let ws = 1; ws <= 9; ws++) {
      assert.deepEqual(
        ctl.computeLayout(restored, ws, out, { screen }),
        ctl.computeLayout(c, ws, out, { screen }),
        `${where}: layout changed across a serialize round trip (${out}#${ws})`,
      );
    }
  }
}

const OPERATIONS = [
  // "add" appears several times on purpose: with this many operations an even
  // mix keeps the window count near zero, and an empty layout proves nothing.
  "add", "add", "add", "add", "remove", "focus", "switchMode", "cycleMode", "minimize", "restore",
  "drag", "resize", "action", "moveNeighbour", "focusNeighbour",
  "switchWorkspace", "cycleWorkspace", "moveToWorkspace", "newStage", "switchStage",
  "cyclePolicy", "toggleFloating", "toggleFullScreen", "resizeActive",
  "toggleSplit", "swapMaster",
  "consume", "expel", "cycleColumnWidth", "centreColumn",
  "cycleStage", "newStageFor", "mergeStage", "moveToOutput",
];

function fuzz(seed, steps) {
  const rand = rng(seed);
  const c = ctl.createController({ gap: GAP, workspaceCount: 9 });
  let screen = SCREENS[0];
  let nextId = 0;
  let busiest = 0;
  const alive = [];

  const someWindow = () => (alive.length ? pick(rand, alive) : null);
  const cellOf = (id) => {
    for (const out of OUTPUTS) {
      const ws = ctl.workspaceOf(c, out, id);
      if (ws !== null) return { ws, out };
    }
    return null;
  };

  for (let step = 0; step < steps; step++) {
    const where = `seed ${seed} step ${step}`;
    const op = pick(rand, OPERATIONS);
    const out = pick(rand, OUTPUTS);
    const ws = ctl.currentWorkspace(c, out);

    switch (op) {
      case "add": {
        const id = `w${nextId++}`;
        alive.push(id);
        ctl.addWindow(c, ws, out, id, {
          appId: pick(rand, APPS),
          geometry: {
            x: Math.floor(rand() * screen.width),
            y: Math.floor(rand() * screen.height),
            width: 100 + Math.floor(rand() * 600),
            height: 100 + Math.floor(rand() * 400),
          },
        });
        break;
      }
      case "remove": {
        const id = someWindow();
        if (!id) break;
        const home = cellOf(id);
        if (!home) break;
        ctl.removeWindow(c, home.ws, home.out, id);
        alive.splice(alive.indexOf(id), 1);
        break;
      }
      case "focus": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (home) ctl.focusWindow(c, home.ws, home.out, id, { screen });
        break;
      }
      case "switchMode":
        ctl.switchMode(c, ws, out, pick(rand, ctl.MODES), { screen });
        break;
      case "cycleMode":
        ctl.cycleMode(c, ws, out, rand() < 0.5 ? 1 : -1, { screen });
        break;
      case "minimize": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (home) ctl.setExcluded(c, home.ws, home.out, id, true);
        break;
      }
      case "restore": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (home) ctl.setExcluded(c, home.ws, home.out, id, false);
        break;
      }
      case "drag":
      case "resize": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (!home) break;
        const placed = ctl
          .computeLayout(c, home.ws, home.out, { screen })
          .windows.find((w) => w.id === id);
        if (!placed || !placed.rect) break;
        const from = placed.rect;
        const to = op === "drag"
          ? { ...from, x: from.x + Math.floor((rand() - 0.5) * 400), y: from.y + Math.floor((rand() - 0.5) * 300) }
          : { ...from, width: Math.max(50, from.width + Math.floor((rand() - 0.5) * 400)) };
        ctl.applyUserGeometry(c, home.ws, home.out, id, {
          from, to,
          cursor: { x: Math.floor(rand() * screen.width), y: Math.floor(rand() * screen.height) },
          screen,
        });
        break;
      }
      case "action": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (!home) break;
        const placed = ctl
          .computeLayout(c, home.ws, home.out, { screen })
          .windows.find((w) => w.id === id);
        if (!placed || !placed.rect) break;
        ctl.applyAction(c, home.ws, home.out, id, pick(rand, ctl.ACTIONS), {
          screen, frame: placed.rect,
        });
        break;
      }
      case "moveNeighbour":
      case "focusNeighbour": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (!home) break;
        const direction = pick(rand, ["left", "right", "up", "down"]);
        if (op === "moveNeighbour") {
          ctl.moveNeighbour(c, home.ws, home.out, id, direction, { screen });
        } else {
          ctl.focusNeighbour(c, home.ws, home.out, id, direction, { screen });
        }
        break;
      }
      case "switchWorkspace":
        ctl.setCurrentWorkspace(c, out, 1 + Math.floor(rand() * 9));
        break;
      case "cycleWorkspace":
        ctl.cycleWorkspace(c, out, rand() < 0.5 ? 1 : -1);
        break;
      case "moveToWorkspace": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (home) {
          ctl.moveWindowToWorkspace(c, home.out, id, 1 + Math.floor(rand() * 9), { screen });
        }
        break;
      }
      case "newStage":
        ctl.newStage(c, ws, out, `S${step}`);
        break;
      case "switchStage": {
        const stages = ctl.stages(c, ws, out).stages;
        if (stages.length) ctl.switchStage(c, ws, out, pick(rand, stages).id);
        break;
      }
      case "cyclePolicy":
        ctl.cycleTilingPolicy(c, ws, out, rand() < 0.5 ? 1 : -1);
        break;
      case "toggleFloating": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (home) ctl.toggleWindowFloating(c, home.ws, home.out, id, { screen });
        break;
      }
      case "toggleFullScreen": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (home) ctl.toggleFullScreen(c, home.ws, home.out, id);
        break;
      }
      case "resizeActive": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (home) {
          ctl.resizeActive(
            c, home.ws, home.out, id,
            pick(rand, ["left", "right", "top", "bottom"]),
            Math.floor((rand() - 0.5) * 300), { screen },
          );
        }
        break;
      }
      case "toggleSplit": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (home) ctl.toggleSplitOrientation(c, home.ws, home.out, id);
        break;
      }
      case "swapMaster": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (home) ctl.swapWithMaster(c, home.ws, home.out, id);
        break;
      }
      case "consume": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (home) ctl.consumeIntoColumn(c, home.ws, home.out, id);
        break;
      }
      case "expel": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (home) ctl.expelFromColumn(c, home.ws, home.out, id);
        break;
      }
      case "cycleColumnWidth": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (home) {
          ctl.cycleColumnWidth(c, home.ws, home.out, id, rand() < 0.5 ? 1 : -1, { screen });
        }
        break;
      }
      case "centreColumn": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (home) ctl.centerColumn(c, home.ws, home.out, id, { screen });
        break;
      }
      case "cycleStage":
        ctl.cycleStage(c, ws, out, rand() < 0.5 ? 1 : -1);
        break;
      case "newStageFor": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (home) ctl.moveWindowToNewStage(c, home.ws, home.out, id);
        break;
      }
      case "mergeStage":
        ctl.mergeActiveStage(c, ws, out, rand() < 0.5 ? 1 : -1);
        break;
      case "moveToOutput": {
        const id = someWindow();
        const home = id && cellOf(id);
        if (!home) break;
        const target = OUTPUTS.find((o) => o !== home.out);
        ctl.moveWindowToOutput(c, home.out, target, id, { screen });
        break;
      }
    }

    // Outputs get unplugged and resolutions change; the layout must survive it.
    if (rand() < 0.05) screen = pick(rand, SCREENS);

    busiest = Math.max(busiest, alive.length);
    checkGlobal(c, screen, where);
  }

  return { windows: alive.length, busiest };
}

test("every mode survives 400 random operations (seed 1)", () => {
  fuzz(1, 400);
});

test("every mode survives 400 random operations (seed 2)", () => {
  fuzz(2, 400);
});

test("every mode survives 400 random operations (seed 12345)", () => {
  fuzz(12345, 400);
});

test("a long run exercises busy layouts, not just empty ones", () => {
  // What matters is that the invariants were checked against real layouts —
  // where the run happens to *end* is not interesting.
  const result = fuzz(777, 600);
  assert.ok(result.busiest >= 5, `the fuzzer only ever reached ${result.busiest} windows`);
});

// A deeper sweep for when the layout engine changes shape — three seeds catch
// regressions, a hundred catch the rare orderings. Off by default so the normal
// run stays fast:
//
//   KOTI_FUZZ_SEEDS=200 npm test
const DEEP_SEEDS = Number(process.env.KOTI_FUZZ_SEEDS || 0);
for (let seed = 1; seed <= DEEP_SEEDS; seed++) {
  test(`deep fuzz seed ${seed}`, () => {
    fuzz(seed, 300);
  });
}
