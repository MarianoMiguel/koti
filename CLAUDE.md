# CLAUDE.md — how to work in this repo

Koti is a secure desktop distribution (secureblue Kinoite derivative). The spec is [PRD.md](PRD.md). The plan and every task status live in [ROADMAP.md](ROADMAP.md).

## Session start

1. Read ROADMAP.md — the `Now / Next` block and any `doing` tasks.
2. Read `tasks/<ID>-*.md` for each `doing` task; its Worklog says exactly where things stand.
3. Check repo + CI state: `git log --oneline -5` and `gh run list --limit 3`.

## Task system

- ROADMAP.md is the single source of truth for statuses: `todo` / `doing` / `blocked` / `done` / `dropped`.
- Non-trivial tasks get a file `tasks/<ID>-<slug>.md` (template in [tasks/README.md](tasks/README.md)) with Goal, Acceptance, and a dated Worklog. Keep its `status:` frontmatter in sync with ROADMAP.md.
- Commit status changes and worklog entries together with the work they describe.
- Work discovered mid-task gets a new row with the next free ID in its milestone — don't silently expand a task's scope.
- Phases beyond the active one stay coarse; elaborate a phase into real tasks when it starts.
- Tasks that need Mariano (hardware access, account/visibility decisions, signing authority) are `blocked`, not silently skipped — list what's needed in the task file.

## Build & ship

- **Local-first (since 2026-08-28, per Mariano):** feature work builds and tests on the dev machine; image builds in CI are manual-only until the image consumes the components.
  - Window policy core: `cd desktop/kwin-policy && npm test` (pure JS, no deps).
  - osctl: `cd osctl && cargo test` (only dep: clap) — **but see "The dev machine is the device" below: there is no cargo there.**

## The dev machine is the device (since 2026-08-29)

This repo is worked on from the P14s running Koti itself. Two consequences, both load-bearing:

**Desktop work is verifiable live — verify it, don't defer it.**

```bash
# KWin script: hot-reload without restarting the compositor
gdbus call --session --dest org.kde.KWin --object-path /Scripting \
  --method org.kde.kwin.Scripting.unloadScript "org.koti.windowpolicy"
gdbus call --session --dest org.kde.KWin --object-path /Scripting \
  --method org.kde.kwin.Scripting.loadScript "$PWD/package/contents/code/main.js" "org.koti.windowpolicy"
gdbus call --session --dest org.kde.KWin --object-path /Scripting --method org.kde.kwin.Scripting.start

# Panel layout: apply to the running session
koti-shell-apply

# Invoke a mode shortcut the KWin script registered
gdbus call --session --dest org.kde.kglobalaccel --object-path /component/kwin \
  --method org.kde.kglobalaccel.Component.invokeShortcut "Koti Layout Tiling"
```

Reading state back: `evaluateScript` always returns `('',)` and never the script's value, and KWin's `print()` is swallowed because kwin_scripting logging is off. Script **errors** are logged, so `throw new Error("MARKER " + value)` plus `journalctl --user -u plasma-kwin_wayland` is how you inspect live state.

**KWin's JS engine is not Node.** It rejects object spread (`{...x}`) and raises a temporal-dead-zone error for `const` arrow helpers referenced from a function defined above them. The bundle is therefore pinned to `--target=es2016`, and core modules use `function` declarations for anything called from earlier in the file. A bundle that parses under `node --check` can still fail to load in KWin — check the journal.

**There is no Rust toolchain here, and `podman run` fails** (`cannot clone: Permission denied` — secureblue disables unprivileged user namespaces). So osctl/agentboxd changes compile only in CI. Don't put unverified Rust into a build that is meant to deliver something else; a typo costs the whole build. Enabling podman needs `ujust set-container-userns`, which weakens hardening — Mariano's call.
- Image build trigger (manual): `gh workflow run build.yml`. Watch: `gh run watch`.
- **Build budget (Mariano, 2026-08-29): Actions minutes on the free account are killers — one image build ≈ 40–90 min of quota.** Dispatch a build only when its output must actually reach a device (new packages/components to upgrade into), never to "verify" something local tests or a dry read of the recipe can check. Batch recipe changes so several land in one build. If in doubt, don't build — ask.
- Images: `ghcr.io/marianomiguel/koti` (AMD/Intel), `ghcr.io/marianomiguel/koti-nvidia` (once M0-06 enables it).
- Recipes: `recipes/*.yml` (BlueBuild recipe-v1 schema). Files shipped into the image live under `files/system/`.
- OSTree image builds take ~30–45 min in CI; don't assume a failure before checking the run.

## Hard rules

- Never commit secrets. `cosign.key` is gitignored; the private signing key exists only in the `SIGNING_SECRET` GitHub secret.
- PRD.md is canonical. Spec changes bump the version and add a Revision History entry.
- The Milestone 0 image stays minimal — package and config changes come after the base is proven on the P14s.
- Per PRD §92: agents build and propose; humans sign stable releases and hold signing/Secure Boot authority.
- **No machine co-authorship in the history.** Commit messages and PR bodies carry no `Co-Authored-By:`, `Claude-Session:`, or "Generated with Claude Code" trailers — subject and body only. This overrides any tool default. Verify before pushing: `git log --format='%B' | grep -i 'co-authored\|anthropic'`.
