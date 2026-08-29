# kwin-policy — Koti window policy layer

The policy layer from PRD §7: one ModeController owning layout per workspace-per-output, with Floating / Tiling / Scrolling / Stage controllers.

## Architecture: pure core + thin adapter

```
src/core/     pure JS layout logic — no KWin imports, unit-tested locally (node --test)
src/kwin/     KWin script adapter — binds core to workspace/window signals
```

Everything that can be a pure function is: geometry in, geometry out. This lets the four modes be developed and tested on any machine (local-first), while the `src/kwin/` adapter — which needs a real Plasma session — stays thin and is exercised via `osctl desktop reload` (M1-08) on the P14s.

## Modules

- `core/controller.mjs` — **the ModeController**: owns every (workspace × output) cell, delegates to the four models, captures and restores per-window state across mode switches (PRD §17), and answers `computeLayout()` with where every window goes
- `core/floating.mjs` — geometry recall, cascade placement for unplaced windows, screen clamping (PRD §11)
- `core/tiling.mjs` — tile layout computation (PRD §12: automatic, columns, rows, main-stack)
- `core/tiling-tree.mjs` — COSMIC-class split tree behind the Automatic policy
- `core/scrolling.mjs` — niri-style scrollable tiling (PRD §13): a strip of **columns**, each of which can hold a vertical stack. The stack is what makes consume/expel mean anything; a flat row of windows cannot express them
- `core/actions.mjs` — 36 Raycast-style placement actions, geometry matched to the vicinae/GNOME setup
- `core/stage.mjs` — Stage grouping model (PRD §14)
- `core/mode-state.mjs` — per workspace-per-output mode + per-window memory (PRD §10, §17, §18)

## The adapter

`src/kwin/main.js` translates and nothing more: KWin signals in, `frameGeometry`
out. It applies layout for Tiling, Scrolling and Stage, and deliberately leaves
Floating alone except on the switch *into* it (PRD §11: "our policy controller
largely gets out of the way"), which is when §17's remembered geometry is
restored.

### KWin's JS engine is not Node

Two things cost a silent failure before they were understood, and both are now
guarded:

- **Object spread is rejected.** The bundle is pinned to `--target=es2016` so
  esbuild lowers it. Without a target the script fails to load entirely, with
  only `Unexpected token '...'` in the journal to say so.
- **`const` arrow helpers referenced from a function defined above them** raise
  a temporal-dead-zone error at load, even though the call happens at run time.
  Core modules use `function` declarations for those.

`node --check` passing proves nothing about KWin. Load it and read the journal.

## Test

```bash
npm test             # node --test, no dependencies
npm run build:kwin   # bundle for KWin (esbuild, es2016)

KOTI_FUZZ_SEEDS=600 npm test   # deep invariant sweep before shipping a change
```

### The fuzzer is the safety net

`test/invariants.test.mjs` drives every operation in every mode against every
cell and re-checks every invariant after each step: no window lost or
duplicated, tiles never overlap or escape the screen, columns never gain a gap,
stage shows exactly its active stage, layout is idempotent, and everything
survives a serialize round trip. Failures print the seed and step so they
replay exactly.

Run the deep sweep after any change to the layout core. It has already caught
bugs no unit test would have: a crash reaching into the strip before reconcile
had populated it, and wrong spacing inside a column.

### On the device

```bash
npm run build:kwin
gdbus call --session --dest org.kde.KWin --object-path /Scripting \
  --method org.kde.kwin.Scripting.unloadScript "org.koti.windowpolicy"
gdbus call --session --dest org.kde.KWin --object-path /Scripting \
  --method org.kde.kwin.Scripting.loadScript "$PWD/package/contents/code/main.js" "org.koti.windowpolicy"
gdbus call --session --dest org.kde.KWin --object-path /Scripting --method org.kde.kwin.Scripting.start
journalctl --user -u plasma-kwin_wayland -n 20
```

To read live state back, `throw new Error("MARKER " + value)` — script errors
reach the journal, `print()` does not.
