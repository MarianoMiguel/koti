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
| Slack | on Flathub as `com.slack.Slack`, community-published | full `flathub` remote — **Mariano chose this 2026-08-29**. Installed on the device (4.51.180) |
| ChatGPT desktop | an official Linux build **does** exist | OpenAI shipped `.deb`/`.rpm` in public preview on 2026-08-11 for Fedora 43/44. Layered from the vendor URL — `chatgpt-26.825.41651-1.x86_64` |

## Remaining

- [x] Full `flathub` remote (Mariano, 2026-08-29) — added to the recipe and to the device
- [x] ChatGPT desktop — OpenAI's official RPM, layered
- [x] Ghostty from COPR + default terminal via `/etc/xdg/xdg-terminals.list`
- [ ] Verify on-device after the image build: Ghostty launches and is what "open a terminal" opens; ChatGPT signs in
- [ ] `osctl audit`: report Flatpak remotes beyond `flathub-verified` as an intentional deviation, the way Customizer Mode is (deferred — see the Rust note below)

## Worklog

- 2026-08-29: Established the cause (flathub-verified filters by publisher, not by app) and checked every candidate against Fedora's mdapi, Flathub's API, and Copr's API rather than assuming. Full app inventory cross-read from `MarianoMiguel/nixos-config` (`modules/nixos/apps.nix`, `development.nix`).
- 2026-08-29: Mariano corrected my assumption that no official ChatGPT Linux app exists — it shipped 2026-08-11. Verified by pulling the RPM header directly: `chatgpt-26.825.41651-1` x86_64.
- 2026-08-29: The `osctl audit` remote check is written up but **not implemented yet**, deliberately. This machine has no Rust toolchain, and `podman run` fails with `cannot clone: Permission denied` because secureblue disables unprivileged user namespaces — so Rust changes cannot be compiled or tested locally, only in CI. Shipping unverified Rust would risk a 40–90 minute build on a typo. Enabling podman needs `ujust set-container-userns`, which weakens hardening and is Mariano's call (see M1-02).
