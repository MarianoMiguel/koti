---
id: M7-01
title: agentboxd skeleton — KVM/QEMU lifecycle
status: doing
depends: []
---

## Goal

`agentboxd` (PRD §41) exists with the Box domain model real and the VM backend abstracted, so Agent Box UX can be developed local-first and the QEMU/KVM half lands on-device.

## Done so far

- `agentboxd/` crate: BoxSpec + five PRD §27 templates with sane defaults (Regulated → restricted egress; Minimal → repo + shell), name validation, lifecycle state machine (destructive ops require Stopped), JSON store at `$XDG_STATE_HOME/koti/boxes.json`, `VmRuntime` trait with mock + QEMU-placeholder backends. 11 unit tests.
- `box` CLI (PRD §26): create/start/stop/restart/open/shell/status/snapshot/reset/delete/list — full surface drives the domain in-process against the mock runtime and clearly labels mock actions.
- `agentboxd` daemon binary is a stub that names its future socket API.

## Remaining (on-device or later)

- [ ] QEMU/KVM backend: VM create/boot/stop, disk provisioning, guest image
- [ ] Socket API + `box` as thin client; `osctl box` passthrough
- [ ] Virtual display + `box open` (M7-04), shell attach (M7-02)
- [ ] Box networking policy (PRD §36–37)

## Worklog

- 2026-08-28: Crate created, 11 tests green, CLI demoed end-to-end (create → start → status → list → delete) on the dev host.
