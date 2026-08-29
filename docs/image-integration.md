# Shipping Koti components in the image

Decision record (2026-08-28), implemented by task M1-09.

## What must land in the image

| Component | Source | Image path |
|-----------|--------|------------|
| `osctl`, `agentboxd`, `box` | Rust workspace (release, x86_64) | `/usr/bin/` |
| Window policy KWin script | `desktop/kwin-policy` (esbuild bundle + `package/`) | `/usr/share/kwin/scripts/org.koti.windowpolicy/` |
| Mode selector plasmoid | `desktop/plasma/mode-selector` | `/usr/share/plasma/plasmoids/org.koti.modeselector/` |
| Shell layout Global Theme | `desktop/plasma/shell-layout` | `/usr/share/plasma/look-and-feel/org.koti.lookandfeel/` |
| Static config seeds | `files/system/` | `/etc`, `/usr/share` (existing files module) |

## Mechanism: builder stage inside the image build

Use BlueBuild's custom-Containerfile capability to add a multi-stage build:

1. `FROM docker.io/library/rust:<pinned> AS components` — `cargo build --release`
   for the workspace, plus `npm ci && npm run build:kwin` for the KWin bundle.
2. Main (secureblue) stage: `COPY --from=components` binaries into `/usr/bin`
   and the three desktop packages into their `/usr/share` paths.

Why not compile in the GitHub job and smuggle artifacts through `files/`: the
BlueBuild action manages its own checkout/build context, so artifacts written
into the workspace before it runs aren't guaranteed to reach the container
build. A builder stage is hermetic and reproduces identically in the Builder VM
(M1-04) later — same stages, no CI-shaped special case.

## Open items (tracked in M1-09)

- [ ] Pin builder images by digest (supply-chain, PRD §91)
- [ ] Verify the exact BlueBuild module syntax for custom Containerfile stages against current docs before implementing
- [ ] Make `org.koti.lookandfeel` the image-default Global Theme so first login gets the PRD §9 layout
- [ ] Load `org.koti.windowpolicy` by default in kwinrc (Plugins group)
