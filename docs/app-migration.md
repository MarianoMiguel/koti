# Application migration map (M6-01)

Maps the PRD §83 daily-driver set to its distribution mechanism (PRD §46 trust
classes, §81–82 placement rules). Rows marked ✋ still need Mariano's call.

## Where apps come from (resolved 2026-08-29)

secureblue ships one Flatpak remote, `flathub-verified`, which filters Flathub
by **publisher**, not by app. Slack, Ghostty and much else are published by the
community rather than by a verified vendor account, so they never appear in
Bazaar at all — the app is not missing, the publisher is unverified.

Mariano's decision (2026-08-29): **Koti carries the full Flathub remote.** The
machine has to run the software it exists to run, and hiding that behind a
verified-publisher filter just moves the install off-platform. The widened
remote is meant to be visible rather than silent — `osctl audit` should report
it as an intentional deviation, the way Customizer Mode is reported (M6-06).

Placement rules that follow from this:

| Situation | Mechanism |
|-----------|-----------|
| Needs to exist before a session does (terminal, editor, VCS) | **Image** — RPM, layered at build time |
| Vendor ships an official Linux package, no Flatpak | **Image** — from the vendor URL, pinned where the vendor supports pinning |
| Normal desktop app, any publisher | **Flatpak** from Flathub |
| Untrusted, or needs credentials it should not hold | **Agent Box** (PRD §20) |

## Engineering

| App | Mechanism | Notes |
|-----|-----------|-------|
| Browser (daily) | **Trivalent** (host, image) | secureblue's hardened Chromium; ships with the base ✋ confirm vs plain Chromium Flatpak |
| VS Code | Flatpak initially ✋ | PRD §81 allows host; Flatpak keeps the host lean — revisit if extension/terminal sandboxing annoys |
| Neovim, Git, GitHub CLI | **Image** (PRD §81 host tools) | shipped 2026-08-29 (Fedora 44 `neovim` 0.12.5) |
| Ghostty | **Image**, COPR `scottames/ghostty` | not in Fedora and not on Flathub; the COPR builds for fedora-44-x86_64 and is the one Universal Blue uses. Default terminal set via `/etc/xdg/xdg-terminals.list` |
| ChatGPT desktop | **Image**, OpenAI's own `.rpm` | official Linux build, public preview since 2026-08-11, supports Fedora 43/44. `persistent.oaistatic.com/codex-app-prod/linux/rpm/latest/chatgpt.x86_64.rpm` |
| Node/pnpm, Python | **Agent Box / Workshop** | never on the host (PRD §81) |
| Android tooling | **Dedicated dev Box** (PRD §84) | needs /dev/kvm passthrough decision |
| Containers | **Inside Boxes** | no host Docker socket (PRD §96) |
| Claude / Codex CLIs | **Agent Boxes** | the whole point |

## Communication

| App | Mechanism | Notes |
|-----|-----------|-------|
| Slack | **Flatpak**, `com.slack.Slack` | community-published, so it needs the full Flathub remote; installed on the P14s 2026-08-29 (4.51.180) |
| Telegram, Beeper | **Flatpak** | audit permissions (PRD §82) |
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
