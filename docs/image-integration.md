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

## Implementation (verified against BlueBuild docs 2026-08-28)

BlueBuild supports this natively: a top-level `stages:` list (each stage: `name`,
`from`, `modules` limited to copy/script/files/containerfile) plus the `copy`
module — `from: <stage>` copies out of a stage, no `from:` copies from the repo
build context. Implemented in both recipes:

- `components` stage on `registry.fedoraproject.org/fedora:42` (builder glibc
  matches the runtime family, unlike a Debian rust image): installs
  rust/cargo/node, `cargo build --release --workspace`, `npm ci && npm run
  build:kwin`, artifacts to `/out`.
- Main stage copies `/out/bin/` → `/usr/bin/`, the bundled KWin package →
  `/usr/share/kwin/scripts/org.koti.windowpolicy/`, and the two Plasma packages
  directly from the repo context into `/usr/share/plasma/…`.
- `.dockerignore` keeps `.git`, `target/`, `node_modules/` out of the context.

## Open items (tracked in M1-09)

- [ ] Pin the builder image by digest (supply-chain, PRD §91)
- [ ] Default-enable `org.koti.windowpolicy` (kwinrc `[Plugins]`) and
      `org.koti.lookandfeel` (kdeglobals) — **deferred deliberately**: shipping
      `/etc/xdg/kwinrc`/`kdeglobals` wholesale could clobber secureblue's
      hardening defaults (e.g. XWayland settings). Needs an on-device look at
      what secureblue ships before choosing the merge mechanism.
- [ ] Deduplicate the two recipes via `recipes/fragments/` once they drift
