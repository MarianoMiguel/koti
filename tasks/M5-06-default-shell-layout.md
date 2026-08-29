---
id: M5-06
title: Default shell layout — macOS-like top bar + centered dock
status: doing
depends: []
---

## Goal

Fresh Koti installs boot into the PRD §9 v1.3 shell (per Mariano, 2026-08-28): slim transparent full-width top bar (launcher + global app menu left; layout-mode widget, system tray, clock right) and a centered floating icons-only dock at the bottom.

## Done so far

- Global Theme package `desktop/plasma/shell-layout` (`org.koti.lookandfeel`) with the panel layout script.
- Mode-selector plasmoid skeleton `desktop/plasma/mode-selector` (`org.koti.modeselector`) — compact icon beside the tray, popup with the four modes (M5-01).

## Remaining

- [ ] On-device (P14s): validate Plasma 6 scripting properties (`opacity`, `floating`, `lengthMode`) and visual polish (bar height, translucency over wallpapers, dock hover behavior)
- [ ] Install both packages into the image (recipe `files/` or RPM) and set `org.koti.lookandfeel` as the image default look-and-feel
- [ ] Global menu: verify appmenu behavior for GTK/electron apps; decide fallback (show app title)
- [ ] Wire mode selector to the window-policy layer (tracked in M5-01)

## Worklog

- 2026-08-28: Packages authored local-first with install/test instructions in `desktop/plasma/README.md`. Cannot execute Plasma on the dev host — needs on-device validation.
