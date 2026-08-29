# Application migration map (M6-01, draft for Mariano's review)

Maps the PRD §83 daily-driver set to its distribution mechanism (PRD §46 trust
classes, §81–82 placement rules). Draft status: mechanisms follow the PRD's
defaults; rows marked ✋ need Mariano's call.

## Engineering

| App | Mechanism | Notes |
|-----|-----------|-------|
| Browser (daily) | **Trivalent** (host, image) | secureblue's hardened Chromium; ships with the base ✋ confirm vs plain Chromium Flatpak |
| VS Code | Flatpak initially ✋ | PRD §81 allows host; Flatpak keeps the host lean — revisit if extension/terminal sandboxing annoys |
| Neovim, Git, GitHub CLI, Ghostty | **Image** (PRD §81 host tools) | add to recipe after P14s validation (M6-03) |
| Node/pnpm, Python | **Agent Box / Workshop** | never on the host (PRD §81) |
| Android tooling | **Dedicated dev Box** (PRD §84) | needs /dev/kvm passthrough decision |
| Containers | **Inside Boxes** | no host Docker socket (PRD §96) |
| Claude / Codex CLIs | **Agent Boxes** | the whole point |

## Communication

| App | Mechanism | Notes |
|-----|-----------|-------|
| Slack, Telegram, Beeper | **Flatpak** | audit permissions (PRD §82) |
| Meetings + screen sharing | Browser (Trivalent) | Wayland portals + PipeWire path (PRD §87) — validate on P14s |

## Creative

| App | Mechanism | Notes |
|-----|-----------|-------|
| Figma | Browser / PWA | |
| Krita, GIMP, Inkscape, OBS, Kdenlive | **Flatpak** | OBS screen capture via portal — validate |
| DaVinci Resolve | Deferred | poor sandbox fit; likely Workshop or dedicated environment on the NVIDIA machine ✋ |

## Infrastructure

| App | Mechanism | Notes |
|-----|-----------|-------|
| Tailscale | **Image** | needs system daemon (PRD §85) |
| Proton VPN | **Image / NetworkManager** ✋ | wireguard config via NM may beat the client app |
| SSH client | **Image** | already in base |
| Local services | **Boxes** | host stays boring (PRD §3.1) |

## Next steps (M6-02/03)

1. Mariano reviews the ✋ rows.
2. Confirmed Flatpaks go into the recipe's `default-flatpaks` module; confirmed
   image packages into a `dnf` module — both **after** the base is proven on
   the P14s (CLAUDE.md hard rule).
