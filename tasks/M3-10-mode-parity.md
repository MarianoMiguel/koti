---
id: M3-10
title: Remaining hyprland/niri/Stage Manager parity, per mode
status: doing
depends: [M3-07]
---

## Goal

Each mode does everything its reference implementation lets people do (Mariano, 2026-08-29: "let me do everything stage manager and niri/hyprland let people do").

## What is already there

Floating: geometry recall, cascade placement, screen clamping, 36 placement actions, free drag/resize.
Tiling: split tree, drop-by-quadrant, shared-edge resize, directional focus/move, gaps.
Scrolling: stable widths, viewport follows focus, drag-reorder, resize-to-width, strip navigation.
Stage: per-app stages, free placement per stage, focus-follows-stage, merge/assign/ungroup in the core.
All modes: per-monitor workspaces, minimize excluded from layout, PRD §17 round trips.

## Remaining

Tiling (hyprland):
- [x] toggle split orientation of the focused split — `Meta+Alt+S`
- [x] toggle a single window floating on top of the tiling — `Meta+Alt+V`
- [x] fullscreen toggle — `Meta+Alt+F`, via KWin's own fullscreen so it covers the panels
- [x] cycle the layout policy (automatic / columns / rows / main-stack) — `Meta+Alt+Space`
- [x] keyboard resize (`resizeactive`) — four unbound actions
- [x] swap with master (`Meta+Alt+Return`) / cycle next

Scrolling (niri):
- [x] **columns**, which can hold a vertical stack — the model was a flat strip before, and consume/expel are meaningless without it
- [x] preset column widths and a key to cycle them — `Meta+Alt+R`
- [x] centre the focused column — `Meta+Alt+M`
- [x] consume / expel — `Meta+Alt+C` / `Meta+Alt+X`
- [x] focus first / last column — `Meta+Alt+Home` / `Meta+Alt+End`
- [x] fullscreen (mode-agnostic, same `Meta+Alt+F`)

Stage (Stage Manager):
- [ ] the rail itself — thumbnails, naming, drag between stages (M5-02)
- [x] cycle stages by keyboard — `Meta+Alt+[` / `Meta+Alt+]`
- [x] put a window on a stage of its own (`Meta+Alt+N`), merge stages (`Meta+Alt+G`)

Workspaces:
- [x] move a window to another monitor — `Meta+Shift+,` / `Meta+Shift+.`
- [ ] per-workspace names, dynamic count

## Notes

The core already implements more than the adapter exposes — `computeTiling` has all four
policies, `stage.mergeStages` exists, `scrolling.setWidth` is wired only to drags. Much of
this list is binding existing pure functions to shortcuts, not new layout maths.

## Worklog

- 2026-08-29: Tiling parity landed — `toggleOrientation`, `swapWithMaster`, `cycleNext` in the tree; policies, lift-out-of-tiling, fullscreen and keyboard resize in the controller. 23 tests.
- 2026-08-29: **Scrolling rebuilt around columns.** niri's strip is a row of columns, each holding a vertical stack, and consume/expel only mean something in that model — the old flat strip could not express them. `scrolling.mjs` rewritten, 30 tests, and the controller migrated with it.
- 2026-08-29: Stage gained cycling, put-on-its-own-stage, and merge. Found a real bug doing it: `reconcile` derives the active stage from the focused window, so an explicit stage switch was reverted on the very next layout. Switching a stage now moves focus with it, which is what the user means anyway.
- 2026-08-29: Fullscreen reworked after the live session showed it never came back cleanly. It used to hide the other windows; KWin restores a window's pre-minimize geometry *after* we set ours, and it emits `minimizedChanged` synchronously, so the re-assert fired too early and the layout came back wrong. Fullscreen now *covers* — everything keeps its place underneath — and goes through KWin's own `fullScreen` property so it covers the panels too. Verified live: the tiling layout returns byte-identical.
- 2026-08-29: 108 Koti shortcuts registered, all listed and rebindable in System Settings → Shortcuts → KWin.
