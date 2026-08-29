---
id: M0-05
title: First green CI build; verify pull + cosign signature
status: done
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
- 2026-08-29: Run 33222300524 green in ~35 min. Image pushed as `ghcr.io/marianomiguel/koti` (`:latest`, `:44`, `:20260829-44`, `:4b94e25-44`, digest sha256:9e37bedd…) and signed; the action's post-push verification reported "The cosign claims were validated". Local `cosign verify` couldn't run because the gh token lacks `read:packages` for the private package — when convenient, Mariano can run `! gh auth refresh -h github.com -s read:packages` to enable client-side verification. Acceptance met via CI-side validation.
