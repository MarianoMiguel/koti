---
id: M0-10
title: Decide repo/package visibility + CI budget
status: todo
depends: []
---

## Goal

Mariano decides whether `MarianoMiguel/koti` (and the ghcr.io packages) stay private or go public. This shapes CI cadence and install friction.

## The trade-off

Private (current state):
- GitHub Actions minutes are metered (~2,000 free/month on the free plan). One OSTree image build ≈ 30–45 min, so a daily 2-recipe schedule would exhaust the budget; that's why the schedule is weekly + on-push for now.
- Private ghcr packages require registry auth on the device (`/etc/ostree/auth.json`) to pull/update.

Public:
- Actions minutes free on public repos → daily rebuilds (PRD §88 upstream tracking) become free.
- No device auth needed; signed images are the security boundary anyway (the cosign key, not obscurity).
- Source becomes visible — nothing secret is in-repo by design (see CLAUDE.md hard rules).

## Recommendation

Go public once comfortable; then switch the workflow schedule to daily and enable the NVIDIA recipe in the matrix.

## Worklog

- 2026-08-28: Created with weekly + on-push CI as the private-repo-safe default.
