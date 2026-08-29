---
id: M3-10
title: Remaining hyprland/niri/Stage Manager parity, per mode
status: todo
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
- [ ] toggle split orientation of the focused split
- [ ] toggle a single window floating on top of the tiling (`togglefloating`)
- [ ] fullscreen / maximize toggle that the layout respects
- [ ] cycle the layout policy (automatic / columns / rows / main-stack) — the core already computes all four
- [ ] keyboard resize (`resizeactive`)
- [ ] swap with master / cycle next

Scrolling (niri):
- [ ] preset column widths and a key to cycle them
- [ ] centre the focused column
- [ ] consume / expel a window into and out of a column (niri's columns hold stacks)
- [ ] focus first / last column
- [ ] fullscreen a column

Stage (Stage Manager):
- [ ] the rail itself — thumbnails, naming, drag between stages (M5-02)
- [ ] cycle stages by keyboard
- [ ] explicit group / ungroup / merge bound to shortcuts (the core supports all three already)

Workspaces:
- [ ] move a window to another monitor
- [ ] per-workspace names, dynamic count

## Notes

The core already implements more than the adapter exposes — `computeTiling` has all four
policies, `stage.mergeStages` exists, `scrolling.setWidth` is wired only to drags. Much of
this list is binding existing pure functions to shortcuts, not new layout maths.
