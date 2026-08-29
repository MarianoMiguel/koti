---
id: M0-05
title: First green CI build; verify pull + cosign signature
status: doing
depends: [M0-02, M0-03, M0-04]
---

## Goal

CI produces and publishes the first signed `ghcr.io/marianomiguel/koti` image.

## Acceptance

- `bluebuild` workflow run is green on main.
- Image is pullable (with auth while the package is private).
- `cosign verify --key cosign.pub ghcr.io/marianomiguel/koti:latest` passes.

## Worklog

- 2026-08-28: Scaffolding pushed; first workflow run triggered by the push. OSTree image builds take ~30–45 min — check `gh run list` before assuming failure.
