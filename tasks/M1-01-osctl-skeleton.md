---
id: M1-01
title: osctl Rust CLI skeleton
status: done
depends: []
---

## Goal

First-party `osctl` CLI (PRD §66) exists as a Rust crate with the command surface stubbed and the audit/state foundation real.

## Acceptance

- `cargo test` green locally; `osctl audit` / `osctl status` run.
- Unknown probe results are never reported as SECURE (PRD §3.4).

## Worklog

- 2026-08-28: Created `osctl/` — clap CLI with `status`, `audit`, `customize on|off` (stub, exits 1), `doctor` (stub). Audit framework: `Probes` trait (SELinux enforcing, Secure Boot via efivars, customizer runtime flag at `/run/koti/customizer`) with Linux impls behind `cfg(target_os)` and mock probes for tests; PRD §97-style grouped rendering. State machine (PRD §50): Fail → DEGRADED outranks customizer → CUSTOMIZING; any Unknown → UNDETERMINED (a fourth, dev-host-only state — unknown is not verified). 5 unit tests green; on macOS the CLI correctly reports UNDETERMINED. Only dependency: clap (PRD §72 small surface).
