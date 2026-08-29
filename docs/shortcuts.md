# Koti keyboard shortcuts

Every one of these is a KWin shortcut, which means they are all listed and
rebindable in **System Settings → Shortcuts → KWin** — search for "Koti". None
of them is hard-coded anywhere else.

Defaults sit on `Meta+Alt` rather than plain `Meta+<letter>`, because KDE
already uses much of `Meta+<letter>` and quietly stealing those bindings would
be worse than an extra modifier. If you want hyprland's `Meta+←/→` for focus,
unbind KDE's Quick Tile in the same settings page first.

Actions listed with — have no default binding: they exist, they are discoverable
in System Settings, and they are yours to bind.


## Modes

| Action | Does | Default |
|--------|------|---------|
| `Koti Layout Next` | next layout mode | — |
| `Koti Layout Previous` | previous layout mode | — |

## Workspaces

| Action | Does | Default |
|--------|------|---------|
| `Koti Workspace Next` | next workspace on this monitor | `Meta+Ctrl+Right` |
| `Koti Workspace Previous` | previous workspace on this monitor | `Meta+Ctrl+Left` |

## Tiling

| Action | Does | Default |
|--------|------|---------|
| `Koti Cycle Layout` | next tiling arrangement | `Meta+Alt+Space` |
| `Koti Cycle Layout Back` | previous tiling arrangement | — |
| `Koti Focus Next Tile` | focus the next tile | — |
| `Koti Focus Previous Tile` | focus the previous tile | — |
| `Koti Grow Height` | make the window taller | — |
| `Koti Grow Width` | widen the window | — |
| `Koti Shrink Height` | make the window shorter | — |
| `Koti Shrink Width` | narrow the window | — |
| `Koti Swap With Master` | swap this window with the first tile | `Meta+Alt+Return` |
| `Koti Toggle Floating` | lift this window out of the tiling | `Meta+Alt+V` |
| `Koti Toggle Fullscreen` | give this window the whole screen | `Meta+Alt+F` |
| `Koti Toggle Split` | flip the split this window sits in | `Meta+Alt+S` |

## Scrolling

| Action | Does | Default |
|--------|------|---------|
| `Koti Centre Column` | centre this column in the viewport | `Meta+Alt+M` |
| `Koti Consume Into Column` | pull the next window into this column | `Meta+Alt+C` |
| `Koti Cycle Column Width` | next preset column width | `Meta+Alt+R` |
| `Koti Cycle Column Width Back` | previous preset column width | — |
| `Koti Expel From Column` | push this window out of its column | `Meta+Alt+X` |
| `Koti Focus First Column` | focus the first column | `Meta+Alt+Home` |
| `Koti Focus Last Column` | focus the last column | `Meta+Alt+End` |

## Stage

| Action | Does | Default |
|--------|------|---------|
| `Koti Merge Stage` | merge this stage into the next one | `Meta+Alt+G` |
| `Koti Move To New Stage` | put this window on a stage of its own | `Meta+Alt+N` |
| `Koti Next Stage` | switch to the next stage | `Meta+Alt+BracketRight` |
| `Koti Previous Stage` | switch to the previous stage | `Meta+Alt+BracketLeft` |

## Placement

| Action | Does | Default |
|--------|------|---------|
| `Koti Hide Others` | hide every other window | `Alt+'` |
| `Koti Show All` | restore every hidden window | — |

## Monitors

| Action | Does | Default |
|--------|------|---------|
| `Koti Move To Next Monitor` | move the window to the next monitor | `Meta+Shift+Period` |
| `Koti Move To Previous Monitor` | move the window to the previous monitor | `Meta+Shift+Comma` |

## Families

These are registered one per member; the table lists the family.

| Actions | Does | Default |
|---------|------|---------|
| `Koti Layout Floating / Tiling / Scrolling / Stage` | switch this workspace's layout mode | — |
| `Koti Layout Next / Previous` | step through the four modes | — |
| `Koti Focus Left / Right / Up / Down` | focus the window in that direction | Meta+Alt+←↑↓→ |
| `Koti Move Left / Right / Up / Down` | move the window in that direction | Meta+Alt+Shift+←↑↓→ |
| `Koti Workspace 1…9` | go to that workspace on this monitor | Meta+1…9 |
| `Koti Move To Workspace 1…9` | move the window to that workspace | Meta+Shift+1…9 |
| `Koti Move To Workspace 1…9 And Follow` | move the window and follow it | — |
| `Koti <36 placement actions>` | almost-maximize, centre, halves, thirds, quarters, sixths… | Alt+[ centre, Alt+] almost-maximize |

## Notes

- **Workspaces are per monitor.** `Meta+3` moves the *focused* monitor to
  workspace 3 and leaves the other monitor where it is, the way hyprland and
  niri behave. KWin's own virtual desktops are global and cannot do this; they
  are kept in sync only so the panel indicator has something to show.
- **Placement actions apply in Floating and Stage only.** Tiling and Scrolling
  decide placement themselves, so "left half" has nothing to act on there and
  the action is refused rather than fighting the layout.
- **Fullscreen covers, it does not hide.** Everything else keeps its place
  underneath, so leaving fullscreen is instant.

