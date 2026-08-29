---
id: M3-00
title: Pure-logic core for all four modes, locally unit-tested
status: done
depends: []
---

## Goal

The four window modes (PRD §10–§14) exist as pure, KWin-free layout logic that builds and tests on any machine — the substance of the ModeController before the adapter binds it to a live Plasma session.

## Acceptance

- Tiling reproduces the PRD §12 diagrams (1/2/3-window) plus columns/rows/main-stack policies.
- Scrolling implements stable widths + minimal viewport-follows-focus (PRD §13).
- Stage implements exclusive grouping, merge, and switch with show/hide sets for the effect layer (PRD §14–15).
- Mode state is per workspace-per-output with workspace defaults, per-window memory, and JSON persistence (PRD §10, §17).
- `npm test` green.

## Worklog

- 2026-08-28 (later): Added `core/tiling-tree.mjs` — the COSMIC-style concealed split-tree autotiler (PRD §12 v1.2): focused-tile insertion with aspect-ratio orientation, quadrant drag-drop, shared-edge resize, directional focus/move, clean collapse on close. 18 more tests; suite now 53 green. This is the real Automatic policy; the list-based `computeTiling` remains for the fixed columns/rows/main-stack policies.
- 2026-08-28: Implemented `desktop/kwin-policy/src/core/{tiling,scrolling,stage,mode-state}.mjs` + 35 node:test cases, all green. `src/kwin/main.js` documents the (unwired) adapter contract; wiring happens on the P14s via `osctl desktop reload` (M1-08). Automatic tiling ≡ main-stack at 0.5 ratio, which reproduces all three PRD diagrams from one rule.
