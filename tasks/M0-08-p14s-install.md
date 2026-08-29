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

- 2026-08-28: Created. Waiting on first green build (M0-05) and hardware access.
