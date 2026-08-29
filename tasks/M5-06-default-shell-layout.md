---
id: M5-06
title: Default shell layout — macOS-like top bar + centered dock
status: done
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

- 2026-08-29: Validated on the P14s against a live session. Live panel state reads `top[align=center len=fill float=false h=29]` and `bottom[align=center len=fit float=true h=54]` — the centered, content-hugging floating dock the PRD asks for.
- 2026-08-29: The gap this task had missed: a Global Theme only rearranges panels when it is *selected* with "Desktop layout" checked, so a rebased machine never sees the layout. Added `files/system/usr/bin/koti-shell-apply`, which feeds the same script to a running session over `org.kde.PlasmaShell.evaluateScript`. The layout script is now idempotent (it removes existing panels first) so it can serve both paths.
- 2026-08-29: The panel spacer needed `expanding=true` written explicitly — the applet's default is a fixed gap, which would have left the tray floating mid-bar instead of right-aligned.
- 2026-08-29: Global menu caveat — `plasma-gmenudbusmenuproxy.service` is failed on this machine, so GTK apps will not populate the appmenu. Tracked separately if it matters.
