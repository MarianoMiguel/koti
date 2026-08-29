---
id: M5-07
title: Fully transparent top bar and dock
status: done
depends: [M5-06]
---

## Goal

The top bar and dock float over the wallpaper with no visible plate at all (Mariano, 2026-08-29: "macOS style").

## Acceptance

- [x] Panels draw no background
- [x] Only panels change — every other widget keeps its Breeze appearance
- [x] Ships in the image and applies without manual steps on a fresh install

## Worklog

- 2026-08-29: Plasma has no "fully transparent" panel setting — Adaptive still paints a plate. Panel chrome comes from the Plasma Style's nine-patch, so Koti ships its own style, `org.koti.transparent` (`desktop/plasma/style`), containing exactly one asset: a `panel-background.svg` whose nine patches have real bounds and zero fill. Plasma falls back to the default theme for every asset a style omits, so nothing else changes.
- 2026-08-29: Applied live on the P14s with `plasma-apply-desktoptheme org.koti.transparent`. Both panels report `opacity=translucent`, which is the code path that uses `widgets/panel-background.svg` — the transparent one. (Plasma's *opaque* path reads a separate `opaque/` asset and would fall back to Breeze's solid plate, so the layout script setting `translucent` explicitly is what keeps this honest.)
- 2026-08-29: The look-and-feel package's new `contents/defaults` selects this style, so applying the Koti Global Theme brings it along.

## Notes

- Fully transparent panels mean panel text contrast now depends entirely on the wallpaper. If light wallpapers become a problem the fallback is a very low-alpha `center` patch rather than reverting the style.
