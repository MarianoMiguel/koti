# desktop/plasma — Koti shell UI

First-party Plasma pieces (PRD §9). These need a live Plasma 6 session, which
since 2026-08-29 the dev machine has — validate changes here against the running
session rather than shipping them unseen.

## Packages

- `shell-layout/` — Global Theme (look-and-feel) `org.koti.lookandfeel`, carrying
  the default shell layout (PRD §9 v1.3): slim full-width top bar (launcher +
  global menu left; layout mode, tray, clock right) and a centered floating
  icons-only dock. Its `contents/defaults` also selects the Koti Plasma Style and
  enables the window-policy KWin script.
- `mode-selector/` — plasmoid `org.koti.modeselector`, the four-mode selector
  (PRD §16). It drives KWin through KGlobalAccel and remembers the chosen mode.
- `style/` — Plasma Style `org.koti.transparent`: one asset, a panel background
  that draws nothing. Everything else falls back to the default theme.

## Applying the layout

A Global Theme only rearranges panels when it is *selected* with "Desktop
layout" checked, so a machine that rebased into Koti never sees the layout.
`koti-shell-apply` (shipped at `/usr/bin`) feeds the same script to the running
session instead:

```bash
koti-shell-apply                     # apply to this session
koti-shell-apply --install-packages  # also (re)install the packages from a checkout
koti-shell-apply --dry-run           # print the layout script
```

The layout script removes existing panels before building, so it is safe to run
repeatedly — you get one top bar and one dock, not a stack of them.

## How the mode selector reaches KWin

A KWin script cannot own a D-Bus name, and a plasmoid cannot call into a KWin
script directly. The channel they share is KGlobalAccel: the window-policy
script registers one global shortcut per mode, and the plasmoid invokes them.
A useful side effect is that every mode is bindable to a key in System Settings
without any extra work.

The reverse direction is best-effort only — if a mode is changed by keyboard
rather than by the applet, the applet's icon can go stale (M5-09).

## Testing packages by hand

```bash
kpackagetool6 --type Plasma/Applet     --install mode-selector
kpackagetool6 --type Plasma/Theme      --install style
kpackagetool6 --type Plasma/LookAndFeel --install shell-layout
plasma-apply-desktoptheme org.koti.transparent
systemctl --user restart plasma-plasmashell
```

Note that a package installed under `~/.local/share` **shadows** the image's
copy of the same ID. Handy while iterating, a trap afterwards: remove the local
copy once the image ships the change, or you will keep running the old one.
