---
id: M3-07
title: Per-monitor workspaces, hyprland/niri semantics, across all four modes
status: done
depends: [M3-01]
---

## Goal

Workspaces that work the way hyprland and niri do — numbered, per monitor, independent — and behave identically in Floating, Tiling, Scrolling and Stage (Mariano, 2026-08-29).

## Acceptance

- [x] Each output has its own current workspace; switching one does not move the other
- [x] Meta+1…9 switches, Meta+Shift+1…9 moves a window, Meta+Ctrl+←/→ cycles
- [x] Windows on other workspaces are hidden, and out of the dock and task switcher
- [x] Each workspace keeps its own mode and its own layout state
- [x] Moving a window between workspaces keeps everything PRD §17 remembers
- [x] A widget shows the workspace number
- [x] Move a window to another *monitor* — `Meta+Shift+,` / `Meta+Shift+.`
- [ ] Per-workspace naming, and dynamic workspace count (niri) — deferred deliberately: nine fixed workspaces match hyprland, and naming needs UI before it earns its keep

## Design

KWin's virtual desktops are global — one current desktop for the whole session — so they cannot express "workspace 3 on the laptop while the external stays on 1". The controller therefore owns workspaces itself, one set per output, and KWin's desktops are kept in sync **only as a display** of the focused output's workspace, so a panel widget has something native to read. `org.koti.workspaceindicator` reads `VirtualDesktopInfo`, so it updates reactively with no polling and no custom protocol, and clicking it switches the focused monitor.

Hiding is minimize plus `skipTaskbar`/`skipSwitcher`, because minimize is the only hide KWin scripting exposes. The original flags are saved per window and given back exactly.

## Worklog

- 2026-08-29: Core model (`currentWorkspace`, `setCurrentWorkspace`, `cycleWorkspace`, `moveWindowToWorkspace`, `workspaceSummary`), 19 tests. Adapter rewired so a cell is (our workspace × output) rather than (KWin desktop × output).
- 2026-08-29: Three bugs the live session found that the unit tests could not:
  - A workspace round trip permanently stripped user-minimized windows out of the dock. `savedFlags` (what the taskbar flags were) and `minimizedByUs` (who minimized it) were one variable doing two jobs; separating them fixed it.
  - `isManaged` excluded `skipTaskbar` windows — but *we* set that flag when hiding, so a hidden window dropped out of management on the next rebuild and could never come back. It now only counts as unmanaged when we did not set the flag.
  - `focusWindow` reached into the scrolling strip before reconcile had put the window there, throwing `window not in strip`. Found by the fuzzer, not by hand.
- 2026-08-29: Verified live — Meta+1…9 switches and hides correctly, the round trip restores geometry and taskbar entries, and the KWin mirror follows (`Koti: workspace 4 on eDP-1`).
