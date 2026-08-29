---
id: M6-06
title: Apps that flathub-verified does not carry
status: doing
depends: [M6-01]
---

## Goal

Mariano's daily apps that are unavailable on the device today — Slack, a ChatGPT desktop, Ghostty as the default terminal, Neovim — have a decided, documented install path (PRD §82–83).

## Findings (2026-08-29, on the P14s)

The device has exactly one Flatpak remote: `flathub-verified`, secureblue's default. It carries only apps whose *publisher* is verified on Flathub, which is why Bazaar shows neither Slack nor Ghostty.

| App | Status | Path |
|-----|--------|------|
| Neovim | already shipped | Fedora 44 `neovim` 0.12.5, layered in the image (M6-03) |
| Ghostty | not in Fedora, not on Flathub | COPR `scottames/ghostty` has `fedora-44-x86_64` — the same COPR Universal Blue uses. Layer it, since the default terminal should exist before any Flatpak does |
| Slack | on Flathub as `com.slack.Slack`, community-published | needs the full `flathub` remote — a deliberate widening of secureblue's default posture ✋ |
| ChatGPT desktop | no official Linux build exists | OpenAI ships no Linux desktop app; Flathub has only unofficial wrappers. Options: an installed web app (Chrome/Brave `--app=`), or OpenAI's Codex desktop, which is what `MarianoMiguel/nixos-config` actually packages (`codex-desktop-linux`) ✋ |

## Remaining

- [ ] ✋ Mariano: decide whether Koti adds the full `flathub` remote (unverified publishers) or keeps unverified apps inside Boxes
- [ ] ✋ Mariano: "ChatGPT desktop" — installed web app, or Codex desktop?
- [ ] Layer Ghostty from COPR and make it the default terminal (xdg-terminal-exec + KDE)
- [ ] `osctl audit`: report Flatpak remotes beyond `flathub-verified` as an intentional deviation, the way the userns check does (M1-02)

## Worklog

- 2026-08-29: Established the cause (flathub-verified filters by publisher, not by app) and checked every candidate against Fedora's mdapi, Flathub's API, and Copr's API rather than assuming. Full app inventory cross-read from `MarianoMiguel/nixos-config` (`modules/nixos/apps.nix`, `development.nix`).
