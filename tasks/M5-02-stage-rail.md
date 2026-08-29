---
id: M5-02
title: Stage rail
status: doing
depends: [M3-05]
---

## Goal

The stages that are not on the canvas are visible and reachable down the left edge, the way Stage Manager shows them (PRD §14).

## Acceptance

- [x] A card per stage, with the app's icon and name
- [x] The stage on the canvas is distinguished from the ones that are not
- [x] Clicking a card brings that stage forward
- [x] Opt-in, because a rail is wrong in the other three modes
- [ ] Window thumbnails rather than app icons
- [ ] Drag a window onto a card to move it between stages
- [ ] Rename a stage

## How it gets its data, and the limitation

A KWin script cannot own a D-Bus name, so the window-policy script has no way to publish its stage grouping to a panel widget. What *is* stock and reactive is `TaskManager.TasksModel` grouped by application — and Koti's stages are per application by default, so grouping windows by app reproduces the stages exactly for the common case. Clicking a card activates that app's window and the policy script switches to that window's stage, so the rail drives the real layout rather than a copy of it.

**Where it diverges:** regrouping stages by hand (`Meta+Alt+N` to split a window onto its own stage, `Meta+Alt+G` to merge) changes the real grouping but not the rail, which still groups by app. The layout is right; the rail's picture of it is approximate.

Fixing that properly needs a channel from the KWin script to the panel. The options, none of them free: a small D-Bus service (blocked on Rust — see [[koti-no-local-rust-toolchain]]); encoding state in a virtual desktop's name, which is reactive but pollutes names the rest of KDE shows; or rewriting the policy script as a declarative KWin script that draws its own rail. Worth doing deliberately rather than quickly.

## Worklog

- 2026-08-29: Rail shipped as `org.koti.stagerail`, placed by `koti-shell-apply --stage-rail` on a floating left panel. No QML errors; panel comes up 81px thick, centred, floating.
