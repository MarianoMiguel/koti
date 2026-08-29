---
id: M0-08
title: "P14s: install + hardware acceptance checklist"
status: blocked
depends: [M0-05, M0-07]
---

## Goal

Koti running on the ThinkPad P14s Gen 6 AMD via the documented rebase path (docs/install.md), with the PRD §75 acceptance checklist run.

## Blocked on

Mariano at the machine (install secureblue, run the rebase, exercise hardware). Approach per PRD §74: boot modern secureblue first; reproduce old NixOS workarounds only if still necessary.

## Acceptance checklist (PRD §75)

- [ ] Wi-Fi
- [ ] Bluetooth
- [ ] GPU
- [ ] touchpad
- [ ] keyboard
- [ ] webcam
- [ ] microphone
- [ ] speakers
- [ ] fingerprint
- [ ] USB4
- [ ] external monitors
- [ ] HDMI
- [ ] power profiles
- [ ] battery
- [ ] suspend/resume
- [ ] dock behavior

Record any needed workaround per PRD §77 (reason, hardware match, scope, validation test, removal criteria) under `hardware/thinkpad-p14s-gen6-amd/`.

## Worklog

- 2026-08-28 (late): USB installer prepared on the Mac: official `secureblue-kinoite-main-hardened-20260502.iso` (4.1 GiB) downloaded from isos.secureblue.dev; checksum file PGP-verified against the secureblue keyring (good signature, key 26B4463ED8F313BC7E3FBDF9D9223AF0F47B3E41); sha256 verified after download; written to the 128 GB stick (`/dev/disk8`). This follows docs/install.md step 1 — boot the stick on the P14s, install with Secure Boot + FDE, then run the rebase steps 2–4 to land on Koti. Note: while the ghcr package is private, step 2 (registry auth) is required before the rebase — or decide M0-10 first and skip it.
- 2026-08-28: Created. Waiting on first green build (M0-05) and hardware access.
- 2026-08-29: **Updates were blocked on the device and nobody would have noticed.** `rpm-ostree upgrade --check` fails with `"docker" namespace "ghcr.io/marianomiguel/koti" defined both in .../marianomiguel-koti.yaml and .../koti.yaml`. Cause: docs/install.md step 2 has you create a registries.d file by hand, but the image ships its own from the `signing` module, and two declarations of one namespace make the container config unparseable. Automatic updates are set to `stage`, so this failed silently in the background. Added step 4 to install.md to delete the bootstrap file after the rebase, and the on-device fix is `run0 rm -f /etc/containers/registries.d/koti.yaml`.
- 2026-08-29: `run0 rpm-ostree upgrade` fails on this system — polkit authenticates, then SELinux denies `entrypoint` because `/usr/bin/rpm-ostree` is `install_exec_t` and run0 execs it from `unconfined_t`. rpm-ostree does not want elevation at all: the CLI talks to `rpm-ostreed` over D-Bus and the daemon authorises the calling user through polkit. Noted in install.md, since the doc's "there is no sudo, elevation is run0" line otherwise invites exactly this mistake.
