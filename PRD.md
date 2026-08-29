# Koti PRD — A Secure Desktop That Feels Like Home

**Status:** Canonical implementation specification
**Version:** 1.3 (revised 2026-08-28 — see Revision History)
**Source:** github.com/MarianoMiguel/koti
**Base:** secureblue Kinoite / Fedora Atomic
**Desktop:** KDE Plasma + KWin on Wayland
**Primary hardware:** ThinkPad P14s Gen 6 AMD
**Secondary hardware:** NVIDIA desktop / RTX 3080 Ti
**Image system:** signed bootable OCI images
**Build system:** BlueBuild
**Primary product pillars:** adaptive desktop, autonomous Agent Boxes, verifiable customization

---

# Revision History

**1.3 (2026-08-28).** Default shell layout specified (§9), per Mariano's direction: macOS-like — slim transparent top bar with the system tray at the right and the layout-mode widget beside it; centered floating dock at the bottom. Ships as a first-party Global Theme package.

**1.2 (2026-08-28).** Automatic tiling specified as a concealed split-tree autotiler with COSMIC-class ergonomics (§12), per Mariano's direction. The tree is internal; the user vocabulary stays "windows tile nicely", never "containers".

**1.1 (2026-08-28).** Revised during project bootstrap. Intent unchanged. Changes:

* added concrete published-artifact naming — repo, registry, image names (§4);
* clarified multi-monitor mode ownership: layout mode is per workspace-per-output (§10);
* documented automatic upstream-tracking rebuilds (§88);
* moved ISO generation out of Milestone 0 — the supported install path until the Stable channel exists is rebase-from-secureblue (§93, §100);
* noted CI is the sole builder until the Builder VM ships in Milestone 1 (§100);
* added a Milestone Map making the desktop and agent tracks explicitly parallel, and allowing Daily Driver Migration (M6) to begin right after M0;
* updated the repository layout to match the real repo — task system, docs, BlueBuild file tree (§99);
* minor language fixes.

**1.0.** Original canonical specification.

---

# 1. Executive Summary

Koti is Finnish for home.

We want to build a secure, polished Linux workstation designed around two realities of modern computing:

1. Humans need different window-management paradigms for different kinds of work.
2. AI agents increasingly need broad computer authority to perform useful work autonomously.

It should feel like home in every use case.

The system will use **secureblue Kinoite** as its security foundation and KDE Plasma/KWin as its desktop substrate.

The desktop exposes four first-class window-management modes:

* **Floating**
* **Tiling**
* **Scrolling**
* **Stage Manager**

These modes are selectable per workspace and are implemented as one coherent first-party window-management system rather than independent third-party plugins.

AI agents run primarily inside **Agent Boxes**: persistent virtual computers with browsers, terminals, development tools, credentials, SSH, Git, SaaS sessions, and unrestricted agent execution inside the Box.

An Agent Box may deliberately run:

```text
claude --dangerously-skip-permissions
codex --full-auto
```

and may have root inside its own environment.

The primary security boundary is therefore:

```text
AGENT BOX
      ╳
TRUSTED HOST
```

rather than requiring the agent to request confirmation for every shell operation.

The system also includes a first-class **Customizer Mode** allowing users to develop and modify the operating system from the machine itself.

Customizer Mode deliberately relaxes selected development restrictions.

Turning Customizer Mode off does **not** automatically declare the computer secure again.

The machine returns to **Secure** status only after it is running a trusted signed deployment and all security invariants pass verification.

The governing philosophy is:

> **Agents may have full autonomy without receiving ambient authority over the entire user identity.**

> **Users may customize deeply without making security state unknowable.**

> **The desktop adapts to the task instead of forcing one window-management ideology.**

---

# 2. Product Positioning

The project is not primarily:

* another Fedora spin;
* an Omarchy clone;
* a KDE rice;
* a hardened Linux distro;
* a tiling distribution;
* a VM manager.

The product is:

> **A secure desktop built for humans and autonomous computers working together.**

Its core differentiators are:

```text
secure atomic host
        +
four-mode adaptive desktop
        +
persistent autonomous Agent Boxes
        +
explicit trust boundaries
        +
safe OS hackability
```

---

# 3. Core Principles

## 3.1 The host is boring and trusted

The host should change slowly.

It contains software requiring integration with:

* hardware;
* KWin;
* Plasma;
* Wayland;
* networking;
* audio;
* security;
* virtualization;
* system management.

Project-specific dependencies should generally not live on the host.

---

## 3.2 Full autonomy is supported

The product must not force agents into confirmation-heavy workflows.

If the user wants an agent to:

* code;
* browse;
* log into SaaS applications;
* deploy;
* SSH;
* commit;
* push;
* manipulate cloud infrastructure;

the system should support that unattended.

Security comes from bounding the environment and credentials rather than repeatedly interrupting the agent.

---

## 3.3 Authority should be explicit

A user should be able to answer:

> What can this agent access?

without needing to reason about every file, socket and credential in their home directory.

---

## 3.4 Security state must be measurable

The UI distinguishes:

```text
SECURE
CUSTOMIZING
DEGRADED
```

These are verified technical states, not cosmetic labels.

---

## 3.5 Customization is part of the product

The system should be unusually hackable for a security-oriented distribution.

The security model must make customization safe rather than attempting to prevent customization entirely.

---

# 4. Technical Foundation

Base images:

### Standard

```text
secureblue Kinoite hardened
```

for AMD and Intel GPUs.

### NVIDIA

```text
secureblue Kinoite NVIDIA Open hardened
```

for supported modern NVIDIA hardware such as RTX 3080 Ti.

Architecture:

```text
Fedora Atomic
     ↓
secureblue
     ↓
our bootable OCI image
     ↓
KDE Plasma
     ↓
KWin
     ↓
our desktop extensions
```

Do not maintain a long-lived secureblue fork unless unavoidable.

Consume secureblue as an upstream hardened image.

Published artifacts:

```text
source     github.com/MarianoMiguel/koti
registry   ghcr.io/marianomiguel
image      koti           (AMD / Intel, from kinoite-main-hardened)
image      koti-nvidia    (from kinoite-nvidia-open-hardened)
```

---

# 5. Trusted Computing Base

The trusted host includes:

```text
kernel
boot chain
SELinux
systemd
NetworkManager
PipeWire
KDE Plasma
KWin
portals
Flatpak
security tooling
osctl
agentboxd
first-party KWin code
first-party Plasma components
```

Anything that runs inside KWin or Plasma with compositor-level authority is considered security-sensitive first-party code.

---

# 6. Desktop Architecture

The custom desktop is split into three primary components.

```text
OUR DESKTOP

├── Window Policy
│   KWin Script / first-party controller
│
├── Visual Effects
│   KWin Effect
│
└── Shell UI
    Plasma/QML components
```

Responsibilities remain deliberately separated.

---

# 7. Window Policy Layer

The policy layer controls:

* layout mode;
* window membership;
* geometry;
* tile assignment;
* Stage membership;
* scrolling order;
* per-workspace state;
* focus behavior.

Conceptually:

```text
ModeController

├── FloatingController
├── TilingController
├── ScrollingController
└── StageController
```

Only one controller owns layout policy for a workspace at a time.

---

# 8. KWin Effect Layer

Responsible for presentation rather than policy.

Examples:

* mode transitions;
* Stage transitions;
* Stage thumbnails;
* smooth scrolling;
* window movement;
* scaling;
* opacity transitions;
* workspace/project transitions.

The effect should not become responsible for business logic or persistence.

---

# 9. Plasma UI Layer

Responsible for:

* mode selector;
* Stage rail;
* Agent Box status;
* project/workspace navigation;
* security-state indicators;
* launcher integration;
* Customizer UI.

### Default Shell Layout (v1.3)

Koti boots into a macOS-like shell by default:

```text
┌──────────────────────────────────────────────────────┐
│ ⌂  App  Menus            [Mode ▾] [tray icons] 12:04 │   ← slim transparent top bar
│                                                      │
│                                                      │
│                                                      │
│              ┌──────────────────────┐                │
│              │  ▣  ▣  ▣  ▣  ▣  ▣   │                 │   ← centered floating dock
└──────────────┴──────────────────────┴────────────────┘
```

* **Top bar:** full width, slim, transparent. Launcher and global application menu on the left; on the right, in order: the layout-mode widget (PRD §16), the system tray, the clock.
* **Dock:** bottom, centered, floating, icons-only.
* **Layout-mode widget:** the four-mode selector lives at the top right beside the system tray — tiling controls are one click away, always visible.

Shipped as a first-party Global Theme (look-and-feel) package so fresh installs get this layout; everything remains rearrangeable with normal Plasma tools.

KDE's ordinary infrastructure remains available underneath:

* Displays;
* Wi-Fi;
* Bluetooth;
* audio;
* power;
* accessibility;
* system settings;
* notifications.

We are not rebuilding these.

---

# 10. The Four Window Modes

Every workspace has exactly one current mode:

```text
Floating
Tiling
Scrolling
Stage
```

Mode state is persistent.

Modes are interchangeable.

Changing the layout mode does not create another workspace.

On multi-monitor systems, layout mode is tracked per workspace-per-output: Scrolling on the laptop panel must not force Scrolling onto an external monitor. The workspace's mode is the default inherited by newly attached outputs.

---

# 11. Floating Mode

Floating is conventional Plasma/KWin.

Our policy controller largely gets out of the way.

Behavior:

* free window positioning;
* overlapping windows;
* native minimize;
* maximize;
* fullscreen;
* native dialogs;
* native multi-monitor behavior;
* ordinary task switching;
* ordinary KDE window rules.

This mode should feel like a polished traditional desktop.

It is the default for new users.

---

# 12. Tiling Mode

Tiling provides automatic layout management without exposing traditional tiling-WM complexity.

The user should not need to understand:

* split trees;
* containers;
* parents;
* directional layout commands.

Default layouts:

### One window

```text
┌─────────────────────────────┐
│                             │
│              A              │
│                             │
└─────────────────────────────┘
```

### Two windows

```text
┌──────────────┬──────────────┐
│              │              │
│      A       │      B       │
│              │              │
└──────────────┴──────────────┘
```

### Three windows

```text
┌──────────────┬──────────────┐
│              │      B       │
│      A       ├──────────────┤
│              │      C       │
└──────────────┴──────────────┘
```

Use KWin's native tiling primitives wherever practical.

### Automatic policy (v1.2)

Automatic is a concealed split-tree autotiler with COSMIC-class ergonomics:

* a new window splits the **focused** tile; split orientation follows the tile's aspect ratio (wide → side-by-side, tall → stacked);
* with no meaningful focus target, the largest tile splits, keeping unattended layouts balanced;
* dragging a window over another shows a quadrant preview (left/right/top/bottom) and inserts accordingly;
* dragging a shared edge resizes the underlying split;
* directional keyboard focus and move;
* closing a window collapses its split cleanly.

The split tree is an implementation detail. It never becomes UI vocabulary: no "containers", no "parents", no layout commands to memorize.

Supported layout policies:

```text
Automatic
Columns
Rows
Main + Stack
```

Users can:

* drag tile boundaries;
* reorder windows;
* temporarily float a window;
* pull a window into a tile;
* maximize temporarily;
* change layout.

---

# 13. Scrolling Mode

Scrolling mode provides a PaperWM-style horizontally continuous workspace.

Conceptually:

```text
               DISPLAY

         ┌──────────┬──────────────┬──────────┐
... ─────│ Browser  │   VS Code    │ Terminal │──── ...
         │          │              │          │
         └──────────┴──────────────┴──────────┘
                            ▲
                           focus
```

Windows have stable widths rather than constantly shrinking as more windows appear.

Users navigate the strip.

Core behavior:

* windows arranged horizontally;
* focus determines viewport movement;
* smooth animated navigation;
* touchpad support;
* keyboard navigation;
* reorder through dragging;
* configurable widths;
* temporary fullscreen;
* multi-monitor support.

This mode is especially optimized for laptop displays.

---

# 14. Stage Manager Mode

Stage Manager groups windows into named or implicit Stages.

Example:

```text
┌──────────────┬──────────────────────────────────┐
│              │                                  │
│ Development  │                                  │
│ [VS][Term]   │           VS Code                │
│              │                                  │
│ Comms        │                 ┌──────────┐     │
│ [Slk][Mail]  │                 │ Terminal │     │
│              │                 └──────────┘     │
│ Design       │                                  │
│ [Fig][Web]   │                                  │
│              │                                  │
└──────────────┴──────────────────────────────────┘
```

Users can:

* create a Stage;
* switch Stage;
* group windows;
* ungroup;
* merge;
* drag a window onto another Stage;
* preserve window geometry;
* name Stages;
* use thumbnails/previews.

KWin effects should provide smooth Apple-like transitions where practical.

---

# 15. Stage Manager Animation Goals

Desired eventual behavior:

```text
active Stage
     ↓
scale down
translate left
     ↓
Stage rail

new Stage
     ↓
translate forward
scale up
     ↓
active canvas
```

The goal is not pixel-perfect Apple imitation.

The goal is the same cognitive model and comparable polish.

---

# 16. Mode Switching

Mode switching must be obvious.

UI:

```text
Layout

[ Floating ]
[ Tiling ]
[ Scrolling ]
[ Stage ]
```

Available from:

* top panel;
* launcher;
* workspace controls;
* optional shortcut.

Suggested accelerator:

```text
Super + Shift + Space
```

opens the selector.

Do not require memorizing one keybinding per mode.

---

# 17. Mode State Preservation

Switching modes should be reversible.

Persist for each window:

```text
floating geometry
tile position
scroll order
scroll width
Stage membership
last focus
monitor
```

Example:

```text
Floating
   ↓
Tiling
   ↓
Floating
```

should restore meaningful floating geometry.

---

# 18. Workspace Model

Virtual desktops remain the fundamental KDE primitive.

Each desktop records:

```text
WorkspaceState {
    mode
    mode-specific state
    monitor state
    focus history
}
```

Eventually Projects may sit above workspaces.

---

# 19. Future Project Model

Potential hierarchy:

```text
PROJECT
    ↓
WORKSPACES
    ↓
LAYOUT MODES
    ↓
WINDOWS
```

and separately:

```text
PROJECT
    ↓
AGENT BOXES
```

Example:

```text
Monarch

├── Development workspace
├── Communication workspace
├── Production workspace
│
└── Monarch Agent Box
```

KDE Activities should be investigated as a possible implementation primitive but are not required for v1.

---

# 20. Agent Boxes

An Agent Box is a persistent virtual computer.

It is not merely:

* a container;
* a shell;
* a coding sandbox.

It can represent an entire working identity.

Example:

```text
MONARCH AGENT BOX

Browser
Terminal
VS Code
Claude
Codex
Git
SSH
Cloud CLIs
Docker
SaaS sessions
```

---

# 21. Agent Box Mental Model

The best metaphor is:

> **An AI employee's laptop living inside your laptop.**

It boots.

It has persistent state.

It remembers browser sessions.

It can have its own SSH key.

It can install packages.

It can be opened graphically.

The agent sees the Box, not the host.

---

# 22. Full Agent Autonomy

Inside an Agent Box, unrestricted agent modes are supported intentionally.

For example:

```text
claude --dangerously-skip-permissions
```

and equivalent Codex full-access modes.

Inside the Box the agent may:

* become root;
* install software;
* use Docker;
* modify system configuration;
* delete files;
* browse arbitrary websites;
* operate the graphical desktop;
* run tests;
* execute builds;
* launch local services.

Destroying the Box is acceptable.

Escaping the Box is not.

---

# 23. Agent Box Computer Use

Agent Boxes support complete graphical interaction.

An agent may:

* open Chromium;
* navigate Vercel;
* navigate Google Cloud;
* use Webflow;
* use HubSpot;
* use GitHub;
* interact with internal tools;
* authenticate;
* click buttons;
* upload files;
* download files.

The agent operates the Box's virtual display.

The host desktop is not exposed by default.

---

# 24. User Access to Agent Boxes

The user can click:

```text
Open Box
```

and see the same desktop the agent is using.

GUI and CLI should both exist.

---

# 25. Creating a Box

The creation experience must be exceptionally simple.

Example:

```text
New Agent Box

Name
[ Monarch ]

Repository
[ github.com/... ]

Template
[ Full Developer ]

Agent
☑ Claude
☑ Codex

Browser
[ Persistent ]

Internet
[ Full ]

Git
[ Enabled ]

SSH
[ Enabled ]

                 Create
```

Everything else should use sane defaults.

---

# 26. Agent Box CLI

Provide:

```text
box create monarch
box start monarch
box stop monarch
box restart monarch
box open monarch
box shell monarch
box status monarch
box snapshot monarch
box reset monarch
box delete monarch
```

Also available via:

```text
osctl box ...
```

---

# 27. Agent Box Templates

Initial templates:

### Full Developer

General autonomous developer machine.

### Web Developer

Node/browser-heavy development.

### Infrastructure

SSH, Terraform, cloud CLIs, deployment tooling.

### Regulated

Additional compliance/security controls.

### Minimal

Repository + shell.

Future:

* Android;
* security research;
* data science;
* design.

---

# 28. Persistence

Agent Boxes are persistent unless marked disposable.

Persist:

* browser profile;
* package installation;
* source;
* shell history;
* agent state;
* credentials;
* SSH config;
* developer caches.

Storage must be encrypted as part of host disk encryption and support optional separate encryption later.

---

# 29. Real Account Support

Using the user's real accounts inside Boxes is explicitly supported.

Example:

```text
Google identity

● Use my normal account
○ Dedicated automation account
```

The product should recommend narrower identities where appropriate without preventing convenience-oriented choices.

Important invariant:

Signing into the same account does not imply sharing the host browser profile.

Every Box maintains its own session state.

---

# 30. Browser Profiles

Each Box has a dedicated persistent browser profile.

Example:

```text
Monarch Box
   ↓
Monarch Chromium profile

Personal Box
   ↓
Personal Chromium profile
```

Do not automatically expose host browser cookies.

---

# 31. Git

Agent Boxes support:

```text
clone
commit
push
pull
rebase
PR creation
CI interaction
```

Authentication options:

* user's Git credentials;
* SSH;
* GitHub App;
* scoped token.

Recommended future default is scoped machine identity.

Real user identity remains allowed.

---

# 32. SSH

Supported credential models:

```text
Box-specific SSH key
Imported existing SSH key
Short-lived SSH certificate
```

Importing a user's actual SSH key is allowed but never automatic.

Recommended advanced architecture uses temporary SSH certificates.

---

# 33. Vercel

Agents must be able to:

* deploy;
* inspect deployments;
* manage environment configuration where authorized;
* use Vercel UI;
* use Vercel CLI.

Dedicated credentials are preferable but not required.

---

# 34. Google Cloud

Agents must be able to:

* operate GCP Console;
* use `gcloud`;
* deploy;
* inspect logs;
* administer resources according to granted IAM permissions.

Recommended future mode uses short-lived workload identities.

A real user login remains supported.

---

# 35. HubSpot / Webflow / SaaS

Agents must be able to perform complete browser-based computer use.

Where APIs support narrow machine credentials, surface them as an optional safer configuration.

Do not make API availability a prerequisite for computer use.

---

# 36. Network Model

Default Full Developer Box:

```text
Internet             allowed
Host services         restricted
LAN                   restricted unless enabled
Other Boxes           denied
```

User may enable broader access.

---

# 37. Box-to-Box Isolation

Default:

```text
Monarch ╳ Dope
Monarch ╳ Personal
Dope    ╳ Personal
```

Cross-Box network and filesystem access is denied unless explicitly configured.

---

# 38. Host Filesystem

No Box receives the host home directory by default.

Sharing is explicit.

Example:

```text
Share folder
~/Development/monarch
        ↓
Monarch Box
```

Possible implementations:

* controlled virtiofs;
* Box-local clone;
* project worktree.

---

# 39. Clipboard

Default:

```text
host ↔ Box clipboard
manual / explicit
```

User may enable automatic sharing for trusted Boxes.

Regulated Boxes should default to no automatic clipboard bridge.

---

# 40. Agent Runtime Technology

Initial backend:

```text
KVM/QEMU
```

managed by:

```text
agentboxd
```

Potential later runtimes:

* Cloud Hypervisor;
* libkrun;
* systemd-vmspawn;
* remote cloud Boxes.

The UX must remain runtime-independent.

---

# 41. `agentboxd`

A small privileged service.

Responsibilities:

* VM lifecycle;
* networking;
* virtual display;
* storage;
* snapshots;
* controlled folder sharing;
* virtual devices;
* credential attachment.

Do not expose raw system libvirt administration to the user session.

---

# 42. HIPAA / Regulated Workloads

Provide a **Regulated Box profile**.

It can enable:

```text
strong client isolation
restricted network egress
explicit approved AI configuration
audit logging
controlled credentials
short credential lifetimes
controlled file transfer
```

This is a technical-control profile.

It must never be marketed as automatically making a workload HIPAA compliant.

---

# 43. PHI Principle

PHI should be unavailable to ordinary development Boxes by construction wherever possible.

Preferred:

```text
source         yes
synthetic data yes
test data      yes

PHI            no
production DB  no
production logs no
```

When PHI access is genuinely needed, use a dedicated Regulated Box or explicitly elevate an existing Box.

---

# 44. Meaningful Approval Boundaries

Avoid:

```text
Can Claude run npm?
Can Claude edit file?
Can Claude use Git?
Can Claude SSH?
```

Prefer rare boundaries such as:

```text
Grant production PHI access?
Grant organization-admin IAM?
Import personal SSH key?
Allow access to another client?
```

Autonomy should remain high.

---

# 45. Arch Workshop

Provide a trusted integrated Arch environment.

Command:

```text
osctl workshop create arch
```

Purpose:

* AUR;
* unusual Linux tooling;
* compatibility;
* experimentation.

Important:

> Workshop is integrated convenience, not strong containment.

Do not present Distrobox as equivalent to an Agent Box.

---

# 46. Trust Classes

User-facing software categories:

### Core

Signed OS image.

### Sandboxed Application

Flatpak or equivalent.

### Workshop

Integrated trusted environment.

### Agent Box

VM boundary intended for autonomous/untrusted execution.

### Capsule

Future lightweight restricted environment for untrusted packages.

---

# 47. Customizer Feature

Customization is a first-class capability.

Two distinct concepts exist:

```text
features.customizer
```

and:

```text
Customizer Mode active
```

---

# 48. Build-Time Customizer Flag

Image configuration supports:

```text
features.customizer = true
```

Default project image:

```text
true
```

This means customization tools exist.

Security-maximal downstream images can set:

```text
features.customizer = false
```

which removes:

* local OS-development UX;
* development hooks;
* author-mode tooling;
* relevant debug utilities.

---

# 49. Runtime Customizer Mode

Normal state:

```text
Customizer Mode: OFF
```

Activate:

```text
osctl customize on
```

or through:

```text
System Settings
→ System
→ Customizer Mode
```

---

# 50. Security States

Three states exist.

## Secure

```text
● SECURE
```

All security invariants pass.

## Customizing

```text
● CUSTOMIZING
```

The user intentionally enabled development capabilities.

## Degraded

```text
● DEGRADED
```

Unexpected drift/security failure exists.

---

# 51. Secure State Requirements

At minimum:

```text
trusted image             yes
image signature           valid
SELinux                   enforcing
Secure Boot               enabled
XWayland                   disabled
unconfined userns         restricted
container policy          expected
Customizer runtime        inactive
development KWin code     inactive
unexpected RPM layering   absent
audit                     passed
```

Intentional documented exceptions are shown separately.

---

# 52. Customizer Mode Capabilities

May enable:

* local desktop script development;
* KWin interactive console;
* development KWin scripts;
* development KWin effects;
* development Plasma widgets;
* additional logging;
* builder integration;
* debug tooling;
* test VM creation;
* development configuration overrides.

It does not automatically enable:

* unsigned kernel modules;
* SELinux permissive mode;
* ambient Docker root socket;
* arbitrary system mutation;
* production release signing.

---

# 53. Desktop Development Loop

KDE is particularly suited to rapid iteration.

Desired workflow:

```text
osctl customize on

edit KWin script

osctl desktop reload
```

Then test the modified behavior on the running desktop.

For riskier effect/shell work:

```text
osctl desktop preview
```

should provide a nested/test session where practical.

---

# 54. KWin Development

Customizer Mode exposes a controlled equivalent of:

```text
plasma-interactiveconsole --kwin
```

for quick experimentation.

Production Secure Mode disables unmanaged development scripts.

---

# 55. Live Custom Code

Running custom KWin code against the main session marks the machine:

```text
CUSTOMIZING
```

This code is not silently considered trusted.

---

# 56. Building the OS Locally

Default design:

```text
HOST
  │
  │ source snapshot
  ▼
BUILDER VM
  │
  ├── BlueBuild
  ├── Podman
  ├── RPM tools
  ├── compiler
  └── caches
  │
  ▼
OCI IMAGE
```

The secure host itself does not need broad build capabilities.

---

# 57. Why the Builder VM Exists

Building arbitrary operating-system source implies executing build scripts and container workloads.

Those should not receive the privileges of the trusted host merely because the user happens to be developing the OS.

The Builder VM can be highly permissive internally.

Its output remains untrusted until tested and explicitly staged.

---

# 58. OS Development Commands

```text
osctl build
```

Build in Builder VM.

```text
osctl test
```

Boot candidate in disposable VM.

```text
osctl stage
```

Stage candidate as next deployment.

```text
osctl rollback
```

Return to previous deployment.

```text
osctl seal
```

Convert current customization source into a trusted signed image/deployment.

---

# 59. `osctl build`

Process:

```text
validate source
↓
snapshot source
↓
send snapshot to Builder
↓
BlueBuild image
↓
SBOM
↓
security checks
↓
return digest + metadata
```

Does not modify the host deployment.

---

# 60. `osctl test`

Launch candidate in a temporary VM.

Automated checks plus optional:

```text
osctl test --interactive
```

The interactive mode lets the developer test:

* KWin;
* Plasma;
* window modes;
* settings;
* security;
* visual behavior.

---

# 61. `osctl stage`

This is the deployment boundary.

Display:

```text
Commit
Image digest
Build result
Security test result
Source state
```

Require administrator authentication.

The candidate becomes the next boot deployment.

---

# 62. `osctl seal`

Canonical customization workflow:

```text
source changes
    ↓
build
    ↓
tests
    ↓
sign
    ↓
stage
    ↓
reboot
    ↓
audit
    ↓
SECURE
```

This is the crucial bridge between:

```text
hackable
```

and:

```text
hardened
```

---

# 63. Turning Customizer Mode Off

`osctl customize off` does not simply modify a setting.

It must:

* unload development KWin code;
* unload development effects;
* restore secure user policies;
* restore secure container policy;
* remove temporary overrides;
* disable author-specific services;
* detect host drift;
* stage a trusted image if necessary;
* request logout/reboot if required;
* execute full audit.

Only then can:

```text
CUSTOMIZING
```

become:

```text
SECURE
```

---

# 64. Local Fast-Build Mode

Advanced users may intentionally allow builds directly on the host.

Example:

```text
osctl customize local-build on
```

This is a stronger deviation.

UI:

```text
CUSTOMIZING

Host build capability: enabled
```

It should automatically disappear when returning to Secure Mode.

---

# 65. Personal Image Signing

Customizers should be able to maintain secure personal variants.

Potential trust roots:

```text
project release key
+
owner customization key
```

Private signing keys must not be accessible to Agent Boxes.

Prefer:

* hardware-backed key;
* dedicated signing environment;
* CI-held signing infrastructure.

---

# 66. `osctl`

First-party Rust application/CLI.

Responsibilities:

```text
security state
audit
image management
updates
rollback
customization
build/test/stage
hardware
Agent Boxes
Workshop
diagnostics
```

Representative API:

```text
osctl status
osctl audit
osctl update
osctl rollback

osctl customize on
osctl customize off
osctl seal

osctl build
osctl test
osctl stage

osctl desktop reload
osctl desktop preview

osctl box create
osctl box list
osctl box open

osctl hardware detect
osctl doctor
```

---

# 67. Graphical System UI

Expose core functionality in Plasma System Settings or a dedicated first-party application.

Sections:

```text
Desktop
  Layout Mode
  Tiling
  Scrolling
  Stage Manager
  Appearance

Agent Boxes
  Boxes
  Templates
  Credentials
  Isolation

Security
  Status
  Audit
  Device Permissions
  Network

System
  Updates
  Rollback
  Hardware
  Customizer Mode
```

CLI and GUI should use the same backend.

---

# 68. Customizer UI

Example:

```text
CUSTOMIZER MODE

● Active

Source
~/Development/os

Branch
kwin-stage-manager

Changes
7 modified files

Desktop development
KWin scripts       active
KWin effects       development
Local host builds  disabled

[ Reload Desktop ]
[ Preview Candidate ]
[ Build System ]
[ Seal Changes ]
[ Exit Customizer ]
```

---

# 69. Security Indicator

Normal state should be quiet.

Example in Settings:

```text
Security
● Secure
```

When Customizing:

```text
● Customizing
```

may be shown in panel/UI because it represents an unusual trust state.

Degraded should be clearly visible.

---

# 70. Theme System

Themes are data.

Allowed:

```text
palette
typography
wallpaper
radius
spacing
borders
terminal colors
editor colors
```

Not allowed:

```text
KWin code
Plasma code
shell scripts
binary plugins
remote execution
post-install hooks
```

Executable customization is separate from theming.

---

# 71. KDE Extension Ecosystem

Secure Mode must prohibit uncontrolled installation of:

* KWin scripts;
* KWin effects;
* Plasma widgets;
* executable themes;
* arbitrary downloadable extensions.

The KDE "download new..." ecosystem should remain disabled/restricted by default.

Customizer Mode may expose controlled development capabilities.

---

# 72. First-Party Desktop Code Security

Our KWin/Plasma components are part of the TCB.

Requirements:

* no network access unless specifically justified;
* no runtime remote code;
* no eval-style arbitrary execution;
* no plugin marketplace;
* no arbitrary shell execution from visual configuration;
* small dependency surface;
* automated tests;
* strict source review;
* signed release packaging.

---

# 73. Desktop Failure Recovery

A desktop customization failure must not brick the workstation.

Provide:

```text
Safe Desktop Session
```

that runs:

* ordinary Plasma;
* no first-party mode controller;
* no custom KWin effect;
* no custom Plasma shell components where avoidable.

This can be selected from login or triggered after repeated failure.

---

# 74. P14s Reference Hardware

The ThinkPad P14s Gen 6 AMD is the first physical reference device.

Initial approach:

> Boot modern secureblue first and reproduce old NixOS workarounds only if they remain necessary.

Do not cargo-cult previous hardware configuration.

---

# 75. P14s Acceptance

Validate:

```text
Wi-Fi
Bluetooth
GPU
touchpad
keyboard
webcam
microphone
speakers
fingerprint
USB4
external monitors
HDMI
power profiles
battery
suspend/resume
dock behavior
```

---

# 76. Hardware Profiles

Support:

```text
hardware.profile = auto
```

and optional explicit profiles:

```text
thinkpad-p14s-gen6-amd
balerion-nvidia
```

Profiles may define:

* kernel args;
* firmware;
* modprobe options;
* power;
* udev;
* device policies.

---

# 77. Hardware Workaround Policy

Every workaround must specify:

```text
reason
hardware match
kernel/version scope
validation test
removal criteria
```

Do not accumulate permanent folklore tweaks.

---

# 78. Custom Kernel Modules

If required:

* reproducible build;
* signed;
* CI-produced;
* compatible with Secure Boot;
* documented;
* automatically tested where feasible.

Never disable signature enforcement for convenience.

---

# 79. DisplayLink

Deferred.

Not a v1 blocker.

If supported:

* package EVDI;
* sign module;
* package vendor daemon;
* proper systemd/udev integration;
* preserve Secure Boot;
* regression test.

---

# 80. Hibernation

Do not weaken Secure Boot/kernel lockdown simply to recover hibernation.

Preferred priority:

1. reliable suspend;
2. shutdown if necessary;
3. revisit secure hibernation later.

---

# 81. Host Development Tools

Keep minimal:

```text
Git
GitHub CLI
Ghostty
Neovim
VS Code
SSH client
basic Unix tooling
osctl
```

Language runtimes generally belong in Agent Boxes/Workshop/dev environments.

---

# 82. Flatpak

Use for suitable GUI software.

Audit permissions.

Prefer curated/verified sources.

Applications requiring excessive host access may instead belong in:

* OS image;
* Box;
* Workshop.

---

# 83. Applications

Daily-driver migration must support:

### Engineering

* Chrome/Chromium
* VS Code
* Neovim
* Ghostty
* Git
* GitHub
* Node/pnpm
* Python
* Android tooling
* containers
* agents

### Communication

* Slack
* Telegram
* Beeper
* meetings
* screen sharing

### Creative

* Figma
* Krita
* GIMP
* Inkscape
* OBS
* Kdenlive
* eventual DaVinci Resolve

### Infrastructure

* Tailscale
* Proton VPN
* SSH
* local services

---

# 84. Android Development

Prefer a dedicated development Box/profile.

Must support:

* Android Studio;
* JDK;
* SDK;
* NDK;
* emulator;
* `/dev/kvm`;
* adb;
* scrcpy.

---

# 85. Tailscale / VPN

Host supports:

* Tailscale;
* Proton VPN;
* normal NetworkManager integration.

Agent Boxes may either:

* inherit routed internet;
* run their own VPN;
* receive specific network policy.

---

# 86. Input Remapping

Trusted host daemon may implement:

* fixed keyboard remaps;
* device-specific mappings.

Do not grant general user processes unrestricted `/dev/uinput`.

Agent computer-use happens inside virtual desktops instead.

---

# 87. Screen Sharing

Host screen sharing must use Wayland portals/PipeWire.

Normal desktop applications should not silently capture arbitrary displays.

---

# 88. Updates

Production update:

```text
CI
 ↓
signed OCI
 ↓
host verifies
 ↓
stage deployment
 ↓
reboot
```

Current deployment remains available for rollback.

Images rebuild automatically on a schedule so upstream secureblue and Fedora security updates flow into Koti without manual action.

---

# 89. Local Package Layering

Avoid normal use of:

```text
rpm-ostree install
```

for permanent workstation configuration.

`osctl audit` should identify host package drift.

Long-term fix:

```text
source
↓
image
↓
deploy
```

---

# 90. Release Channels

Provide:

```text
edge
testing
stable
```

### Edge

All passing main builds.

### Testing

Explicitly promoted.

### Stable

Human-approved.

Primary workstation tracks Stable.

---

# 91. CI Pipeline

```text
PR
 ↓
lint
 ↓
security checks
 ↓
image build
 ↓
SBOM
 ↓
vulnerability scan
 ↓
VM boot
 ↓
desktop tests
 ↓
security tests
 ↓
sign
 ↓
provenance
 ↓
publish
```

Pin privileged CI dependencies/actions.

---

# 92. Production Release Authority

Agents may:

* write code;
* modify image recipes;
* open PRs;
* run tests;
* build candidates.

Agents may not autonomously:

* sign stable releases;
* alter Secure Boot trust;
* modify production signing keys;
* mark failed audits as passing.

---

# 93. ISO

Stable images produce installation media.

```text
stable OCI digest
      ↓
ISO generation
      ↓
boot test
      ↓
signed checksums
```

No insecure first-boot bootstrap should be required.

ISO generation is a Stable-channel deliverable, not a Milestone 0 requirement. Until then, the supported install path is: install stock secureblue, rebase to the signed Koti image, verify.

---

# 94. Installation

Defaults:

```text
UEFI
Secure Boot
full-disk encryption
KDE Wayland
XWayland off
standard account
separate admin authority recommended
first-boot security audit
```

---

# 95. Secrets

Never embed:

* SSH keys;
* tokens;
* browser profiles;
* account cookies;
* `.env`;
* cloud credentials;
* signing keys;

inside image layers.

---

# 96. Security Invariants

Stable Secure state should include approximately:

```text
Secure Boot                      ON
SELinux                          ENFORCING
XWayland                         OFF
unrestricted user extensions    OFF
uncontrolled KDE plugins         OFF
unexpected package layering      NONE
Docker root socket               NONE
normal user in docker group      NO
normal user in libvirt group     NO
normal user in uinput group      NO
unexpected container policy      NONE
Customizer Mode                  OFF
image signature                  VERIFIED
security audit                   PASS
```

Intentional hardware/personality exceptions should be visible rather than hidden.

---

# 97. `osctl audit`

Output:

```text
SYSTEM SECURITY

Image
✓ Signature verified
✓ Known release provenance
✓ Stable channel

Boot
✓ Secure Boot
✓ Expected kernel arguments

MAC
✓ SELinux enforcing

Desktop
✓ Wayland
✓ XWayland disabled
✓ Approved KWin scripts only
✓ Approved KWin effects only

Privileges
✓ No Docker group
✓ No libvirt group
✓ No ambient uinput

Customization
✓ Customizer inactive
✓ No development overrides

Result
SECURE
```

Statuses:

```text
PASS
INTENTIONAL DEVIATION
WARNING
FAIL
```

---

# 98. Diagnostics

Provide:

```text
osctl doctor
```

Check:

* deployment;
* kernel;
* KWin;
* Plasma;
* failed units;
* SELinux denials;
* GPU;
* portal state;
* PipeWire;
* network;
* Agent Box backend;
* Customizer state.

Optional:

```text
osctl doctor --bundle
```

creates a scrubbed debugging archive.

Never automatically include project source or credentials.

---

# 99. Repository Layout

Recommended:

```text
koti/                      (repository root — github.com/MarianoMiguel/koti)
├── PRD.md                 (this document)
├── ROADMAP.md             (task tracking — statuses live here)
├── CLAUDE.md              (working conventions for agent sessions)
├── tasks/                 (one file per non-trivial task: detail + worklog)
├── docs/                  (install, operations)
│
├── recipes/
│   ├── koti.yml
│   ├── koti-nvidia.yml
│   └── fragments/
│
├── files/
│   └── system/            (BlueBuild files module → image rootfs)
│
├── desktop/
│   ├── kwin-policy/
│   │   ├── mode-controller/
│   │   ├── floating/
│   │   ├── tiling/
│   │   ├── scrolling/
│   │   └── stage/
│   │
│   ├── kwin-effect/
│   │
│   └── plasma/
│       ├── mode-selector/
│       ├── stage-rail/
│       ├── agent-status/
│       └── project-ui/
│
├── osctl/
│
├── agentboxd/
│
├── agent-images/
│   ├── full-developer/
│   ├── web/
│   ├── infrastructure/
│   └── regulated/
│
├── hardware/
│   ├── thinkpad-p14s-gen6-amd/
│   └── balerion-nvidia/
│
├── policies/
│   ├── selinux/
│   ├── containers/
│   └── network/
│
├── themes/
├── systemd/
├── tests/
└── .github/
```

---

# Milestone Map

Milestones are ordered by dependency, not strictly by number:

```text
M0 Secure Base
 ├─→ M1 Customizer Infrastructure
 │        └─→ M2 → M3 → M4 → M5     (desktop track)
 ├─→ M6 Daily Driver Migration       (may begin immediately after M0)
 └─→ M7 → M8 → M9 → M10 → M11       (agent track)

M12 depends on M1 (Workshop) and M5 (theme UI).
```

The desktop track and the agent track are independent and may proceed in parallel. M6 does not require the four-mode desktop: daily-driving stock-Plasma Koti early creates the fast feedback loop the rest of the roadmap depends on.

---

# 100. Milestone 0 — Secure Base

Deliver:

```text
secureblue Kinoite derivative
signed OCI image
CI build + sign + publish
documented rebase install path
Secure Boot installation
rollback
audit
P14s boot
```

ISO generation moves to the Stable-channel milestone (§93). Until the Builder VM exists (Milestone 1), CI is the only builder; local builds are a Milestone 1 deliverable, not an M0 requirement.

Do not customize Plasma heavily yet.

---

# 101. Milestone 1 — Customizer Infrastructure

This happens before the four-mode desktop.

Deliver:

```text
osctl
Customizer Mode
Builder VM
test VM
build
test
stage
rollback
seal
security-state machine
desktop script reload
```

Reason:

> If iteration is painful, developers will bypass the architecture.

---

# 102. Milestone 2 — Four-Mode Behavioral Prototype

Prototype independently.

Use existing implementations/research as references.

Validate desired behavior for:

```text
Floating
Tiling
Scrolling
Stage Manager
```

Do not optimize architecture yet.

The goal is understanding UX.

---

# 103. Milestone 3 — First-Party Window Policy

Implement:

```text
ModeController

FloatingController
TilingController
ScrollingController
StageController
```

Use supported KWin APIs wherever possible.

Deliver stable mode switching and persistence.

---

# 104. Milestone 4 — KWin Effects

Implement visual polish:

* smooth layout movement;
* scrolling transitions;
* Stage transition;
* previews;
* mode transitions.

Visual effects must never become required for correctness.

---

# 105. Milestone 5 — Plasma Product UI

Build:

* mode selector;
* Stage rail;
* launcher integration;
* project/workspace UI;
* security state;
* Customizer UI.

At this point the system should no longer visually feel like generic Plasma.

---

# 106. Milestone 6 — Daily Driver Migration

Port required workstation functionality.

Acceptance criterion:

> Seven consecutive working days without booting the previous workstation OS for ordinary work.

---

# 107. Milestone 7 — Agent Box MVP

Implement:

```text
box create
box start
box open
box shell
box stop
box reset
box delete
```

VM includes:

* browser;
* shell;
* root;
* Git;
* SSH;
* Claude;
* Codex;
* developer stack.

---

# 108. Milestone 8 — Full Computer Use

Agent can autonomously:

```text
browse
log into SaaS
operate Vercel
operate GCP
operate Webflow
operate HubSpot
commit
push
SSH
deploy
```

Persistent browser session required.

---

# 109. Milestone 9 — Agent UX

Add:

* graphical Box creation;
* templates;
* project association;
* Box status;
* agent status;
* notifications;
* credential management;
* snapshots.

Target:

```text
New Box
→ select project
→ create
→ log in once
→ delegate work
```

---

# 110. Milestone 10 — Credential Security

Add optional safer identities:

* GitHub Apps;
* short-lived SSH certs;
* GCP workload identity;
* scoped SaaS identities;
* credential broker.

Crucial:

> These improve security without breaking unattended operation.

---

# 111. Milestone 11 — Regulated Workloads

Add:

* Regulated Box;
* egress policy;
* audit;
* retention;
* PHI boundaries;
* compliance-oriented configuration.

---

# 112. Milestone 12 — Themes / Workshop / Ecosystem

Add:

* safe theme schema;
* theme compiler;
* Arch Workshop;
* signed customization packages;
* eventually AUR Capsules.

---

# 113. Desktop Acceptance Criteria

Floating:

* behaves like normal Plasma.

Tiling:

* automatic;
* usable entirely with mouse;
* no required tiling-WM knowledge.

Scrolling:

* smooth;
* touchpad-friendly;
* works well on laptop display.

Stage:

* grouping understandable;
* visually polished;
* animations performant.

Mode changes:

* reliable;
* reversible;
* state-preserving.

---

# 114. Agent Acceptance Criteria

An Agent Box must be able to receive:

> Build this feature, deploy it and tell me when it's done.

and autonomously:

```text
edit
install dependencies
run tests
launch browser
research
log into services
commit
push
deploy
SSH
verify
```

without routine approval prompts.

---

# 115. Customizer Acceptance Criteria

On the P14s:

```text
enable Customizer
↓
modify KWin code
↓
reload
↓
test
↓
modify OS recipe
↓
build
↓
VM test
↓
stage
↓
reboot
↓
audit
↓
Secure
```

must be a normal supported workflow.

---

# 116. Security Acceptance Criteria

A compromised Agent Box must not automatically gain:

* host filesystem;
* another Box;
* host browser;
* host SSH keys;
* OS signing keys;
* unrestricted virtualization;
* Secure Boot configuration;
* host admin access.

A compromised custom desktop component is more serious because it belongs to the TCB, so its code must receive correspondingly stronger review.

---

# 117. Non-Goals

Do not:

* build another compositor;
* fork KWin without extremely strong reason;
* build a full desktop environment;
* replace KDE Settings infrastructure;
* implement every KDE customization;
* expose arbitrary downloadable plugins in Secure Mode;
* make Distrobox a security boundary;
* force separate SaaS accounts;
* force per-command agent approvals;
* solve every legacy Linux application;
* support arbitrary AUR packages on the host;
* weaken Secure Boot for hardware convenience.

---

# 118. North-Star Desktop

Conceptually:

```text
┌──────────────────────────────────────────────────────┐
│ Monarch                      Tiling ▾       ● Secure │
├───────────────┬──────────────────────────────────────┤
│               │                                      │
│ MONARCH       │                                      │
│ ● Active      │              VS Code                 │
│ Claude ● 38m  │                                      │
│               │                        ┌───────────┐ │
│ DOPE          │                        │ Terminal  │ │
│ Codex ✓       │                        └───────────┘ │
│               │                                      │
│ PERSONAL      │                                      │
│               │                                      │
│ + Workspace   │                                      │
│ + Agent Box   │                                      │
└───────────────┴──────────────────────────────────────┘

Floating | Tiling | Scrolling | Stage
```

The system happens to use:

```text
Fedora
secureblue
bootable OCI
SELinux
KWin
Plasma
KVM
```

but these are implementation details.

---

# 119. North-Star Agent Experience

```text
New Agent Box

Name:
Monarch

Template:
Full Developer

Repository:
monarch-web

Browser:
Persistent

Accounts:
Use my normal accounts

SSH:
Monarch key

Internet:
Full

                    Create
```

Minutes later:

```text
MONARCH BOX

Claude
● Working for 46m

Task
Fix failed payment recovery,
deploy to production,
verify behavior.

Browser
Vercel authenticated
GCP authenticated
HubSpot authenticated

Git
main → agent/payment-recovery

SSH
monarch-production
```

The user can leave it alone.

---

# 120. North-Star Customizer Experience

```text
System
────────────────────────────

Security
● Customizing

Source
~/Development/os

Desktop
kwin-stage-manager branch

Builder
● Ready

[ Reload Desktop ]

[ Build Candidate ]

[ Test in VM ]

[ Seal & Reboot ]

[ Return to Secure Mode ]
```

After sealing:

```text
Security
● Secure

Image
sha256:...

Source
commit abc123

Audit
Passed
```

---

# 121. Governing Architectural Rule

Every feature should be evaluated in this order:

1. Does it preserve a meaningful security boundary?
2. Does it preserve autonomous agent operation?
3. Does it minimize cognitive load?
4. Can the trust implication be explained clearly?
5. Can it be reproduced from source?
6. Can it be rolled back?
7. Can the user customize it without permanently degrading security?
8. Can we maintain it without accidentally building our own entire desktop stack?

---

# 122. Final Product Principle

The operating system should make three seemingly conflicting properties coexist:

```text
FULL AUTONOMY
     +
DEEP CUSTOMIZATION
     +
STRONG SECURITY
```

The mechanism is separation.

Agents receive:

> **a lot of power in a bounded computer.**

Customizers receive:

> **a lot of freedom in an explicitly untrusted development state.**

The host receives:

> **a small, auditable, signed and recoverable trusted state.**

The desktop receives:

> **multiple ways of working without requiring the user to adopt the culture of a particular window manager.**

The final objective is not to build the Linux system with the fewest capabilities.

It is to build a Linux system where **capability, autonomy and trust are clearly separated**, while remaining delightful enough that the secure path is also the path users actually want to take.

