---
id: M3-01
title: ModeController — per workspace-per-output state, wired into KWin
status: done
depends: [M3-00]
---

## Goal

One controller owns layout for every (workspace × output) cell (PRD §7, §10), delegates to the four mode models, and a thin KWin adapter turns its answers into real window geometry.

## Acceptance

- [x] `core/controller.mjs` binds floating/tiling/scrolling/stage behind one API, unit-tested
- [x] Mode is per workspace-per-output; a second output keeps its own mode (PRD §10 v1.1)
- [x] Mode switches are reversible — Floating → Tiling → Floating restores geometry (PRD §17)
- [x] KWin adapter applies geometry, tracks membership, and survives windows that predate it
- [x] Verified on the P14s against a live Plasma 6 / KWin Wayland session

## Worklog

- 2026-08-29: Wrote `core/controller.mjs` (cells, membership, focus, mode switching with §17 capture/restore, directional navigation, JSON persistence) and rewrote `src/kwin/main.js` from observe-only into a real adapter. 92 core tests green.
- 2026-08-29: **The shipped script never ran.** The image bundle failed to load with `Unexpected token '...'` — esbuild had no `--target`, so it emitted object spread, which KWin's QJSEngine rejects. Pinned `--target=es2016`. A second QJSEngine strictness bite: `const` arrow helpers referenced from a function defined above them raise a temporal-dead-zone error at load, so `tilePos`/`scrollPos` became function declarations.
- 2026-08-29: Bug found on-device — windows that existed *before* the script loaded came in through `rebuild()` without geometry, so the §17 floating restore cascaded them instead of restoring. `rebuild()` now goes through `attach()`, which passes live geometry and guards against duplicate signal connections; `captureFloatingGeometry()` writes down real geometry before leaving Floating.
- 2026-08-29: Verified live on the P14s over `org.kde.kwin.Scripting` hot-load with four real windows: tiling produced a correct split tree, scrolling gave stable 960px widths with off-strip windows minimized, stage placed the canvas beside the rail, and Floating → Tiling → Stage → Floating returned byte-identical geometry.

## Notes

- Trivalent (Chromium) refuses to go below ~500px wide, so its tile is wider than the split asks for. That is an application minimum-size constraint, not a layout bug.
- KWin scripts cannot own a D-Bus name, so the plasmoid drives modes through KGlobalAccel (see M5-01). The reverse channel — KWin telling the panel a shortcut changed the mode — is best-effort only; the indicator can drift if modes are switched by keyboard. Tracked in M5-09.
