# desktop/plasma — Koti shell UI

First-party Plasma pieces (PRD §9). These need a live Plasma 6 session, so they
develop local-first as reviewable packages and validate on the P14s via the
Customizer loop.

## Packages

- `shell-layout/` — Global Theme (look-and-feel) package `org.koti.lookandfeel`
  carrying the default shell layout (PRD §9 v1.3): slim transparent top bar
  (launcher + global menu left; mode widget, tray, clock right) and a centered
  floating icons-only dock.
- `mode-selector/` — plasmoid `org.koti.modeselector`, the four-mode selector
  (PRD §16) that sits beside the system tray.

## Testing on a Plasma machine

```bash
# applet
kpackagetool6 --type Plasma/Applet --install mode-selector    # or --upgrade
systemctl --user restart plasma-plasmashell

# look-and-feel layout (applies panel layout on selection)
kpackagetool6 --type Plasma/LookAndFeel --install shell-layout
```

Then add "Layout Mode" to a panel, or apply the Koti Global Theme with
"Desktop layout" checked.
