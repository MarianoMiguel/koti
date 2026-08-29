---
id: M1-02
title: Security-state machine v0 — full §51 invariant set
status: doing
depends: [M1-01]
---

## Goal

`osctl audit` verifies the full PRD §51 Secure-state requirement list, not just the first three probes.

## Remaining checks to implement (PRD §51, §96)

- [x] trusted image reference + signature-verified transport (`rpm-ostree status --json`)
- [x] no unexpected RPM layering
- [x] XWayland disabled (process scan)
- [x] no Docker root socket; user not in docker/libvirt/uinput groups
- [x] intentional deviations rendered separately (◆, drives CUSTOMIZING)
- [ ] expected kernel arguments
- [ ] unconfined userns restricted (needs the secureblue-variant-specific expectation)
- [ ] container policy as expected (`/etc/containers/policy.json` vs shipped policy)
- [ ] no development KWin code active (depends on M1-03's customizer contract)

Most probes are Linux-only: each stays behind the `Probes` trait with mocked unit tests; on-device validation happens on the P14s (after M0-08).

## Worklog

- 2026-08-28 (later): Expanded to 11 checks across Image/Boot/MAC/Desktop/Privileges/Customization. New Linux probes: booted image via `rpm-ostree status --json` (serde_json added to osctl), Xwayland process scan, docker socket presence, /etc/group membership. 10 state tests cover each invariant's failure → DEGRADED, including unverified transport and foreign image. Remaining four checks need on-device facts (kernel args baseline, userns expectation, shipped container policy, customizer contract).
- 2026-08-28: Started. State derivation + SELinux/SecureBoot/customizer probes landed with M1-01.
