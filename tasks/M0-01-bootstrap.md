---
id: M0-01
title: "Bootstrap: repo, PRD v1.1, task system, private GitHub repo"
status: done
depends: []
---

## Goal

Turn the PRD into a working project: revise the spec, stand up durable task tracking, and get the code + plan into a private GitHub repo so any future session can resume.

## Acceptance

- PRD revised to v1.1 with a Revision History; intent unchanged.
- ROADMAP.md + tasks/ + CLAUDE.md conventions in place.
- Private repo `MarianoMiguel/koti` exists and main is pushed.

## Worklog

- 2026-08-28: Original PRD v1.0 committed as-is first, so the revision is a reviewable diff. Revised to v1.1: artifact naming (§4), per-output mode ownership (§10), upstream-tracking rebuilds (§88), ISO moved out of M0 in favor of the rebase install path (§93/§100), CI-as-only-builder note (§100), Milestone Map (parallel desktop/agent tracks; M6 can start after M0), real repo layout (§99). Task system created (ROADMAP.md, tasks/, CLAUDE.md). Milestone 0 scaffolding: recipes, CI workflow, signing, install docs.
