---
id: M1-02
title: Security-state machine v0 — full §51 invariant set
status: doing
depends: [M1-01]
---

## Goal

`osctl audit` verifies the full PRD §51 Secure-state requirement list, not just the first three probes.

## Remaining checks to implement (PRD §51, §96)

- [ ] trusted image / signature verified (ostree deployment origin + policy)
- [ ] expected kernel arguments
- [ ] XWayland disabled
- [ ] unconfined userns restricted
- [ ] container policy as expected
- [ ] no development KWin code active
- [ ] no unexpected RPM layering (`rpm-ostree status` parsing)
- [ ] no Docker root socket; user not in docker/libvirt/uinput groups
- [ ] intentional deviations rendered separately (PRD §97 `INTENTIONAL DEVIATION`)

Most probes are Linux-only: keep each behind the `Probes` trait with mocked unit tests; on-device validation happens on the P14s (after M0-08).

## Worklog

- 2026-08-28: Started. State derivation + SELinux/SecureBoot/customizer probes landed with M1-01.
