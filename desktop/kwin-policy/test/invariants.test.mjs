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

  if (mode === "tiling") {
    for (const w of visible) {
      assert.ok(
        within(w.rect, screen),
        `${where}: tile ${w.id} escaped the screen — ${JSON.stringify(w.rect)}`,
      );
    }
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        assert.ok(
          !overlaps(visible[i].rect, visible[j].rect),
          `${where}: tiles ${visible[i].id} and ${visible[j].id} overlap`,
        );
      }
    }
  }

  if (mode === "scrolling") {
    // Windows sit shoulder to shoulder on the strip, in order, with no gaps.
    const ordered = res.windows;
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1].rect;
      const here = ordered[i].rect;
      assert.equal(
        here.x, prev.x + prev.width,
        `${where}: the strip has a gap between ${ordered[i - 1].id} and ${ordered[i].id}`,
      );
      assert.equal(here.height, prev.height, `${where}: strip heights differ`);
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
  "add", "remove", "focus", "switchMode", "cycleMode", "minimize", "restore",
  "drag", "resize", "action", "moveNeighbour", "focusNeighbour",
  "switchWorkspace", "cycleWorkspace", "moveToWorkspace", "newStage", "switchStage",
];

function fuzz(seed, steps) {
  const rand = rng(seed);
  const c = ctl.createController({ gap: 8, workspaceCount: 9 });
  let screen = SCREENS[0];
  let nextId = 0;
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
    }

    // Outputs get unplugged and resolutions change; the layout must survive it.
    if (rand() < 0.05) screen = pick(rand, SCREENS);

    checkGlobal(c, screen, where);
  }

  return { windows: alive.length };
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

test("a long run reaches a populated state rather than churning empty", () => {
  const result = fuzz(777, 600);
  assert.ok(result.windows > 0, "the fuzzer should end with windows alive");
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
