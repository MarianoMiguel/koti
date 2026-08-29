# Koti Roadmap

Task tracking for Koti. The spec is [PRD.md](PRD.md); working conventions are in [CLAUDE.md](CLAUDE.md); per-task detail and worklogs live in [tasks/](tasks/).

**Statuses in this file are the single source of truth:** `todo` · `doing` · `blocked` · `done` · `dropped`

Phases map to PRD milestones (M0–M12). Phases beyond the active one are deliberately coarse — elaborate a phase into real tasks when it starts, not before.

## Working mode (since 2026-08-28, per Mariano)

**Local-first, feature-first.** Feature development (desktop, osctl, agentboxd) happens on the dev machine with local builds and tests. CI image builds are manual-only (`gh workflow run build.yml`) until the image starts consuming the components. Feature tracks run in parallel — don't serialize on hardware-blocked tasks.

## Now / Next

- **Now:** shell UI packages (M5-06 mac-like layout, M5-01 mode selector) + full §51 invariant set in `osctl audit` (M1-02)
- **Next:** KWin script packaging for the policy layer; image install of the Plasma packages; KWin adapter wiring once the Customizer loop runs on the P14s
- **Waiting on Mariano:** P14s install (M0-08), visibility/CI decision (M0-10)

---

## Phase 0 — Secure Base (M0, PRD §100)

Goal: a signed Koti OCI image, built and published by CI, that the P14s can rebase to, update from, and roll back on.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| M0-01 | Bootstrap: repo + PRD v1.1 + task system + private GitHub repo | done | 2026-08-28, see task file |
| M0-02 | BlueBuild recipe `recipes/koti.yml` on `kinoite-main-hardened` | done | minimal by design; packages come post-M0 |
| M0-03 | Cosign keypair; `SIGNING_SECRET` repo secret; commit `cosign.pub` | done | private key only in GH secrets |
| M0-04 | CI: build + sign + push `ghcr.io/marianomiguel/koti` | done | manual-only during local-first phase |
| M0-05 | First green CI build; verify pull + cosign signature | done | green 2026-08-29; cosign claims validated in CI |
| M0-06 | NVIDIA variant `koti-nvidia.yml` enabled in build matrix | todo | secondary hardware (RTX 3080 Ti desktop) |
| M0-07 | Install docs: secureblue → rebase → signed rebase | done | docs/install.md |
| M0-08 | P14s: install + hardware acceptance checklist (PRD §75) | blocked | needs Mariano at the machine |
| M0-09 | On-device: update + rollback verified | blocked | after M0-08 |
| M0-10 | Decide repo/package visibility + CI budget | todo | Mariano's call — see task file |

## Phase 1 — Customizer Infrastructure (M1, PRD §101)

Goal: iteration is painless — build, test, stage, seal, roll back from the machine itself.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| M1-01 | `osctl` Rust CLI skeleton (`status`, `audit` stubs) | done | osctl/ builds + tests locally |
| M1-02 | Security-state machine v0: SECURE / CUSTOMIZING / DEGRADED via `osctl audit` (PRD §51, §97) | doing | 11 checks live (image/boot/MAC/desktop/privileges); 4 remain needing on-device facts |
| M1-03 | `osctl customize on/off` + drift detection v0 | todo | |
| M1-04 | Builder VM + `osctl build` | todo | replaces CI-only builds |
| M1-05 | `osctl test` — boot candidate in disposable VM | todo | |
| M1-06 | `osctl stage` / `osctl rollback` | todo | |
| M1-07 | `osctl seal` — customization → trusted signed deployment | todo | |
| M1-08 | `osctl desktop reload` — KWin script dev loop | todo | |

## Phase 2 — Four-Mode Behavioral Prototype (M2, PRD §102)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| M2-01 | Tiling prototype on KWin native tiling primitives | todo | |
| M2-02 | Scrolling prototype; survey existing PaperWM-style KWin scripts as references | todo | |
| M2-03 | Stage Manager prototype | todo | |
| M2-04 | Mode-switch UX validation across all four modes | todo | |

## Phase 3 — First-Party Window Policy (M3, PRD §103)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| M3-00 | Pure-logic core for all four modes, locally unit-tested (tiling, scrolling, stage, mode-state) | done | desktop/kwin-policy, 35 tests |
| M3-01 | ModeController architecture + per-workspace-per-output state | doing | cell model done; KWin/Script package + esbuild bundling ready, adapter v0 observing-only |
| M3-02 | FloatingController | todo | |
| M3-03 | TilingController | doing | COSMIC-style split-tree autotiler core landed (PRD §12 v1.2, 18 tests); KWin wiring pending |
| M3-04 | ScrollingController | todo | |
| M3-05 | StageController | todo | |
| M3-06 | Mode switching + state persistence (PRD §17) | todo | |

## Phase 4 — KWin Effects (M4, PRD §104)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| M4-01 | Smooth layout movement | todo | |
| M4-02 | Scrolling transitions | todo | |
| M4-03 | Stage transitions + thumbnails | todo | |
| M4-04 | Mode transitions | todo | |

## Phase 5 — Plasma Product UI (M5, PRD §105)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| M5-01 | Mode selector | doing | plasmoid skeleton `org.koti.modeselector` done; policy-layer wiring pending |
| M5-02 | Stage rail | todo | |
| M5-03 | Security-state indicator | todo | |
| M5-04 | Customizer UI | todo | |
| M5-05 | Project/workspace UI + launcher integration | todo | |
| M5-06 | Default shell layout: macOS-like top bar + centered dock (Global Theme, PRD §9 v1.3) | doing | package done; on-device validation + image install pending |

## Phase 6 — Daily Driver Migration (M6, PRD §106) — may start right after Phase 0

| ID | Task | Status | Notes |
|----|------|--------|-------|
| M6-01 | Application audit: map current daily apps → Flatpak / image / Box / Workshop (PRD §82–83) | todo | |
| M6-02 | Curated Flatpak set in image config | todo | |
| M6-03 | Host dev tools in image (PRD §81: git, gh, ghostty, neovim, code, osctl) | todo | |
| M6-04 | Tailscale + Proton VPN working (PRD §85) | todo | |
| M6-05 | Acceptance: 7 consecutive working days without the previous OS | todo | |

## Phase 7 — Agent Box MVP (M7, PRD §107)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| M7-01 | `agentboxd` skeleton: KVM/QEMU lifecycle | doing | domain model + daemon stub done (11 tests); QEMU backend is on-device work |
| M7-02 | `box create/start/stop/shell/delete` CLI | doing | full command surface works in-process on mock runtime; shell/open attach pending |
| M7-03 | Full Developer guest image (browser, shell, root, git, SSH, Claude, Codex) | todo | |
| M7-04 | Virtual display + `box open` | todo | |
| M7-05 | Persistence + `box snapshot` / `box reset` | todo | |

## Phase 8 — Full Computer Use (M8, PRD §108)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| M8-01 | Persistent per-Box browser profiles | todo | |
| M8-02 | Autonomous SaaS flows verified (Vercel, GCP, Webflow, HubSpot, GitHub) | todo | |
| M8-03 | Box network policy (PRD §36–37) | todo | |

## Phase 9 — Agent UX (M9, PRD §109)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| M9-01 | Graphical Box creation + templates | todo | |
| M9-02 | Box/agent status in shell UI + notifications | todo | |
| M9-03 | Credential management UI + snapshots | todo | |

## Phase 10 — Credential Security (M10, PRD §110)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| M10-01 | GitHub App / scoped-token identities | todo | |
| M10-02 | Short-lived SSH certificates | todo | |
| M10-03 | GCP workload identity; credential broker | todo | |

## Phase 11 — Regulated Workloads (M11, PRD §111)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| M11-01 | Regulated Box profile: egress policy, audit logging, PHI boundaries | todo | |

## Phase 12 — Themes / Workshop / Ecosystem (M12, PRD §112)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| M12-01 | Theme schema + compiler (data-only, PRD §70) | todo | |
| M12-02 | Arch Workshop (`osctl workshop create arch`) | todo | |
| M12-03 | Signed customization packages; AUR Capsules | todo | |
