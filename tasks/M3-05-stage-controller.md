---
id: M3-05
title: StageController — implicit per-app stages, one on the canvas
status: doing
depends: [M3-01]
---

## Goal

Stage Manager behaves like Stage Manager (PRD §14): windows grouped into stages, one stage on the canvas, everything else out of the way.

## Acceptance

- [x] Each application gets its own stage by default; a second window of an app joins that app's stage
- [x] Only the active stage is on the canvas — everything else is hidden
- [x] Focusing a hidden window switches to its stage
- [x] The frontmost window is centred and largest, with the rest peeking out behind it
- [x] Leaving Stage restores the geometry windows had before (PRD §17)
- [ ] Stage rail UI with thumbnails, naming, drag-between-stages (M5-02)

## Worklog

- 2026-08-29: First cut shipped and Mariano called it immediately — "Stage doesn't really work. It looks like a buggy floating mode. Not an 'all apps except front minimized' by default." He was right, and it was a design error rather than polish: `reconcile` assigned every window to one implicit stage, so "the active stage" was all of them, laid out at their own remembered floating geometry inside a margin. That is floating with a margin.
- 2026-08-29: Rewrote grouping around the app. `addWindow` now carries an `appId` (the adapter passes KWin's `resourceClass`), and a window with no stage joins, in order: the stage it remembers, the stage already holding its app, or a new stage of its own. Four apps now means four stages and one window on screen.
- 2026-08-29: Rewrote the canvas layout too — frontmost window centred at 92% of the canvas, each window behind it a step smaller and offset up-left so its edge shows. Deliberately *not* the windows' own floating geometry, which is what made it look accidental; §17 still hands that geometry back on the way out.
- 2026-08-29: The rail only reserves width once a second stage exists. With one app open there is nothing to put in a rail, and an empty 307px strip reads as a bug.
- 2026-08-29: Fixed a related wart found in the same test: returning to Floating un-minimized windows *the user* had minimized. The adapter now tracks which windows it hid and restores only those (PRD §11 promises native minimize).
- 2026-08-29: Verified live on the P14s with Konsole, Obsidian, Trivalent and Slack open — Stage put the focused app's window at `372,74 1484x1028` (centred on the canvas past the rail) and hid the other three; Floating restored all four exactly. 98 core tests green.

## Notes

- Until the rail exists (M5-02), the hidden stages are only reachable through the dock, the task switcher, or by focusing a window — there is nothing on screen showing which stages exist. That is the biggest remaining gap in this mode.
