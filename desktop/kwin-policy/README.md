# kwin-policy — Koti window policy layer

The policy layer from PRD §7: one ModeController owning layout per workspace-per-output, with Floating / Tiling / Scrolling / Stage controllers.

## Architecture: pure core + thin adapter

```
src/core/     pure JS layout logic — no KWin imports, unit-tested locally (node --test)
src/kwin/     KWin script adapter — binds core to workspace/window signals
```

Everything that can be a pure function is: geometry in, geometry out. This lets the four modes be developed and tested on any machine (local-first), while the `src/kwin/` adapter — which needs a real Plasma session — stays thin and is exercised via `osctl desktop reload` (M1-08) on the P14s.

## Modules

- `core/tiling.mjs` — tile layout computation (PRD §12: automatic, columns, rows, main-stack)
- `core/scrolling.mjs` — PaperWM-style strip model (PRD §13: stable widths, viewport follows focus)
- `core/stage.mjs` — Stage grouping model (PRD §14)
- `core/mode-state.mjs` — per workspace-per-output mode + per-window memory (PRD §10, §17, §18)

## Test

```bash
npm test   # runs node --test test/
```
