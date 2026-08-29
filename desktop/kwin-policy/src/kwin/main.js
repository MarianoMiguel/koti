/*
 * KWin adapter — binds the pure policy core (src/core/) to the KWin scripting
 * API. Bundled by `npm run build:kwin` into package/contents/code/main.js,
 * because KWin loads one script file.
 *
 * The division of labour (PRD §72 in spirit): every decision about *where a
 * window goes* lives in core/ and is unit-tested on any machine. This file only
 * translates — KWin signals in, frameGeometry out. It stays small enough to read
 * in one sitting, because it is the part that runs privileged in the compositor.
 *
 * KWin's JS engine is not a browser: no console, no modules, no file I/O, and
 * `print()` is swallowed unless kwin_scripting logging is enabled. Errors are
 * logged, so failures here surface in `journalctl --user -u plasma-kwin_wayland`.
 */

import * as controller from "../core/controller.mjs";

var GAP = 8;

var ctl = controller.createController({ gap: GAP });

// KWin swallows print() unless kwin_scripting logging is switched on, but the
// console.* family reaches the journal regardless. Off by default; turn it on
// with `koti_debug=true` in the script's config to trace layout decisions in
// `journalctl --user -u plasma-kwin_wayland`.
var DEBUG = readConfig("koti_debug", true);

function log(message) {
    if (DEBUG) console.info("Koti: " + message);
}

// Re-entrancy guard: we move windows, KWin tells us windows moved, and without
// this we would answer our own notification forever.
var applying = false;

// Two different facts, kept apart because conflating them loses state:
//   savedFlags[id]     — the taskbar/switcher flags a window had before we hid
//                        it, so they can be given back exactly.
//   minimizedByUs[id]  — we are the ones who minimized it, so we are the ones
//                        allowed to un-minimize it. A window the user minimized
//                        is theirs and stays minimized.
var savedFlags = {};
var minimizedByUs = {};

// --- identity ---------------------------------------------------------------

function windowId(window) {
    return String(window.internalId);
}

/**
 * Windows the policy layer places. Everything else — panels, docks, popups,
 * OSDs, dialogs — keeps KWin's own behaviour, which is what makes the managed
 * modes feel like a desktop rather than a tiling WM.
 */
function isManaged(window) {
    if (!window || window.deleted || !window.managed) return false;
    if (!window.normalWindow) return false;
    if (window.desktopWindow || window.dock || window.splash || window.utility) return false;
    if (window.dialog || window.popupWindow || window.transient) return false;
    if (window.specialWindow) return false;
    // skipTaskbar normally means "not a window the user thinks about" — but we
    // set it ourselves to keep hidden workspaces out of the dock. Excluding
    // those would drop them out of management the moment they were hidden, and
    // they would never come back.
    if (window.skipTaskbar && !savedFlags[windowId(window)]) return false;
    if (window.fullScreen) return false; // a fullscreen window owns its output
    return true;
}

function outputIdOf(window) {
    var output = window.output || workspace.activeScreen;
    return String(output.name);
}

/**
 * Koti's workspaces are its own, not KWin's.
 *
 * KWin's virtual desktops are global — one current desktop for the whole
 * session — so they cannot express "workspace 3 on the laptop while the
 * external monitor stays on 1", which is how hyprland and niri work and what
 * Mariano asked for. The controller therefore owns a workspace per output, and
 * KWin's desktops are kept in sync only as a *display* of the active output's
 * workspace, so panel widgets have something native to read.
 */
function cellOf(window) {
    var outputId = outputIdOf(window);
    var known = controller.workspaceOf(ctl, outputId, windowId(window));
    return {
        workspaceId: known === null ? controller.currentWorkspace(ctl, outputId) : known,
        outputId: outputId,
    };
}

function currentCell() {
    var outputId = String(workspace.activeScreen.name);
    return { workspaceId: controller.currentWorkspace(ctl, outputId), outputId: outputId };
}

/** The placement area: the screen minus panels and struts. */
function screenOf(cell) {
    var output = outputByName(cell.outputId);
    var area = workspace.clientArea(KWin.PlacementArea, output, workspace.currentDesktop);
    return { x: area.x, y: area.y, width: area.width, height: area.height };
}

function outputByName(name) {
    var screens = workspace.screens;
    for (var i = 0; i < screens.length; i++) {
        if (String(screens[i].name) === name) return screens[i];
    }
    return workspace.activeScreen;
}

function windowByIdOnCell(id) {
    var list = workspace.windowList();
    for (var i = 0; i < list.length; i++) {
        if (windowId(list[i]) === id) return list[i];
    }
    return null;
}

// --- applying a layout ------------------------------------------------------

/**
 * Push the core's answer into KWin.
 *
 * Floating is deliberately exempt (PRD §11: "our policy controller largely gets
 * out of the way") — we only place floating windows on the switch *into*
 * Floating, to restore the geometry §17 promised, never continuously.
 */
function applyLayout(cell, options) {
    var force = options && options.force;
    var mode = controller.mode(ctl, cell.workspaceId, cell.outputId);
    if (mode === "floating" && !force) return;

    var screen = screenOf(cell);
    var plan = controller.computeLayout(ctl, cell.workspaceId, cell.outputId, { screen: screen });

    applying = true;
    try {
        for (var i = 0; i < plan.windows.length; i++) {
            var placement = plan.windows[i];
            var window = windowByIdOnCell(placement.id);
            if (!window || window.deleted) continue;

            // Scrolling and Stage keep windows that are off the canvas alive but
            // out of sight; minimize is the only hide KWin scripting exposes.
            if (!placement.visible) {
                hideWindow(window, placement.id);
                continue;
            }
            // Only un-hide what *we* hid. A window the user minimized
            // themselves stays minimized — PRD §11 promises native minimize,
            // and restoring it behind their back is not that.
            if (window.minimized) {
                if (!minimizedByUs[placement.id]) continue;
                showWindow(window, placement.id);
                // KWin restores a window's pre-minimize geometry as part of
                // un-minimizing, and does it after this returns — so setting
                // geometry now would be overwritten. Ask again once it lands.
                reassertAfterRestore(window, placement.rect);
            } else {
                showWindow(window, placement.id);
            }
            if (!placement.rect) continue;
            if (!window.moveable && !window.resizeable) continue;
            setGeometry(window, placement.rect);
        }
    } catch (e) {
        print("Koti: applyLayout failed: " + e);
    } finally {
        applying = false;
    }
}

function rectStr(r) {
    return Math.round(r.x) + "," + Math.round(r.y) + " " + Math.round(r.width) + "x" + Math.round(r.height);
}

function cursorPoint() {
    var p = workspace.cursorPos;
    return { x: p.x, y: p.y };
}

function rectOf(window) {
    var g = window.frameGeometry;
    return { x: g.x, y: g.y, width: g.width, height: g.height };
}

function setGeometry(window, rect) {
    var current = window.frameGeometry;
    if (
        Math.round(current.x) === Math.round(rect.x) &&
        Math.round(current.y) === Math.round(rect.y) &&
        Math.round(current.width) === Math.round(rect.width) &&
        Math.round(current.height) === Math.round(rect.height)
    ) {
        return; // already there; skip the churn and the animation
    }
    window.frameGeometry = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
    };
}

/**
 * Re-apply geometry once a window has finished coming back from minimized.
 * One shot: the handler disconnects itself, so a window that is hidden and
 * shown repeatedly does not accumulate listeners.
 */
function reassertAfterRestore(window, rect) {
    var handler = function () {
        if (window.minimized) return;
        window.minimizedChanged.disconnect(handler);
        var wasApplying = applying;
        applying = true;
        try {
            setGeometry(window, rect);
        } catch (e) {
            print("Koti: could not re-place a restored window: " + e);
        } finally {
            applying = wasApplying;
        }
    };
    window.minimizedChanged.connect(handler);
}

/**
 * Take a window off screen. Minimize is the only hide KWin scripting offers,
 * so it doubles as "on another workspace" — and the taskbar and switcher are
 * told to ignore it, because a window on workspace 4 has no business showing
 * up in the dock while you are looking at workspace 1.
 */
function hideWindow(window, id) {
    if (!savedFlags[id]) {
        savedFlags[id] = { skipTaskbar: window.skipTaskbar, skipSwitcher: window.skipSwitcher };
        window.skipTaskbar = true;
        window.skipSwitcher = true;
    }
    if (!window.minimized && window.minimizable) {
        window.minimized = true;
        minimizedByUs[id] = true;
    }
}

/** Give a window its taskbar and switcher entries back, minimized or not. */
function restoreFlags(window, id) {
    var saved = savedFlags[id];
    if (!saved) return;
    window.skipTaskbar = saved.skipTaskbar;
    window.skipSwitcher = saved.skipSwitcher;
    delete savedFlags[id];
}

/** @returns true if this call un-minimized the window. */
function showWindow(window, id) {
    restoreFlags(window, id);
    if (!minimizedByUs[id]) return false;
    delete minimizedByUs[id];
    if (!window.minimized) return false;
    window.minimized = false;
    return true;
}

/**
 * Lay out one output: hide everything that belongs to another workspace, then
 * apply the current workspace's layout. Workspaces sit *above* modes — every
 * mode gets the same workspace behaviour rather than each reinventing it.
 */
function applyOutput(outputId, options) {
    var current = controller.currentWorkspace(ctl, outputId);
    var list = workspace.windowList();
    applying = true;
    try {
        for (var i = 0; i < list.length; i++) {
            var window = list[i];
            if (!isManaged(window) || outputIdOf(window) !== outputId) continue;
            var id = windowId(window);
            var ws = controller.workspaceOf(ctl, outputId, id);
            if (ws !== null && ws !== current) {
                hideWindow(window, id);
            } else {
                // Back on this workspace: give the taskbar entry back even if
                // the window stays minimized because the *user* minimized it.
                // Without this a workspace round trip silently strips a
                // minimized window out of the dock for good.
                restoreFlags(window, id);
            }
        }
    } catch (e) {
        log("could not hide off-workspace windows: " + e);
    } finally {
        applying = false;
    }
    applyLayout({ workspaceId: current, outputId: outputId }, options);
}

function applyAllOutputs(options) {
    var screens = workspace.screens;
    for (var i = 0; i < screens.length; i++) {
        applyOutput(String(screens[i].name), options);
    }
}

function relayoutCurrent() {
    applyOutput(String(workspace.activeScreen.name), {});
}

// --- window bookkeeping -----------------------------------------------------

// Windows we have already wired signals to. Without this, every rebuild()
// would connect another copy of each handler to the same window.
var connected = {};

function attach(window, options) {
    if (!isManaged(window)) return;
    var takesFocus = !(options && options.focus === false);
    var id = windowId(window);
    var cell = cellOf(window);
    // Pass the live geometry every time, not just on windowAdded: windows that
    // existed before the script loaded arrive through rebuild(), and without
    // their geometry the §17 floating restore has nothing to restore to.
    controller.addWindow(ctl, cell.workspaceId, cell.outputId, id, {
        geometry: rectOf(window),
        // Stage groups by application (PRD §14): resourceClass is KWin's
        // notion of "which app is this", so two Konsole windows share a stage
        // while Konsole and the browser get one each.
        appId: window.resourceClass ? String(window.resourceClass) : null,
        focus: takesFocus,
    });
    // A window the user has minimized is not on the layout: it must not hold a
    // tile or a slot on the strip while it is off screen.
    controller.setExcluded(
        ctl, cell.workspaceId, cell.outputId, id,
        window.minimized && !minimizedByUs[id],
    );

    // KWin's desktop switching must not hide anything — visibility is decided
    // by the controller, and KWin's desktops only mirror the indicator.
    if (!window.onAllDesktops) {
        applying = true;
        try {
            window.onAllDesktops = true;
        } catch (e) {
            log("could not pin " + id + " to all desktops: " + e);
        } finally {
            applying = false;
        }
    }

    if (connected[id]) return;
    connected[id] = true;

    // A drag has to mean something in every mode — a managed layout that
    // silently undoes the drag reads as a broken window manager. What it means
    // is the core's decision (controller.applyUserGeometry); the adapter only
    // reports what the user did, which needs the geometry from *before* the
    // drag to tell a move from a resize.
    var dragFrom = null;

    window.interactiveMoveResizeStarted.connect(function () {
        if (applying) return;
        dragFrom = rectOf(window);
    });

    window.interactiveMoveResizeFinished.connect(function () {
        if (applying) return;
        var cell = cellOf(window);
        var to = rectOf(window);
        var from = dragFrom || to;
        dragFrom = null;
        var cursor = cursorPoint();
        log(
            "drag " + (window.resourceClass || "?") +
            " from " + rectStr(from) + " to " + rectStr(to) +
            " cursor " + cursor.x + "," + cursor.y +
            " mode " + controller.mode(ctl, cell.workspaceId, cell.outputId),
        );
        controller.applyUserGeometry(ctl, cell.workspaceId, cell.outputId, id, {
            from: from,
            to: to,
            cursor: cursor,
            screen: screenOf(cell),
        });
        applyLayout(cell, {});
        log("after drag " + rectStr(rectOf(window)));
    });

    window.minimizedChanged.connect(function () {
        // Ours to hide, ours to ignore — minimizedByUs marks the windows this
        // script minimized to get them off the canvas or off the workspace,
        // and those stay in the layout because they are coming back.
        if (applying || minimizedByUs[id]) return;
        var cell = cellOf(window);
        controller.setExcluded(ctl, cell.workspaceId, cell.outputId, id, window.minimized);
        applyLayout(cell, {});
    });

    window.outputChanged.connect(function () {
        if (applying) return;
        // Moving between monitors moves the window between cells: the mode is
        // per workspace-per-output (PRD §10 v1.1), so it may land in a
        // different layout entirely.
        rebuild();
    });

    applyLayout(cell, {});
}

function detach(window) {
    var cell = cellOf(window);
    var id = windowId(window);
    delete connected[id];
    delete savedFlags[id];
    delete minimizedByUs[id];
    controller.removeWindow(ctl, cell.workspaceId, cell.outputId, id);
    applyLayout(cell, {});
}

/** Re-derive membership from scratch — cheap, and the honest answer after any
 *  change we did not observe directly (output changes, desktop moves). */
/**
 * Which window the layout should treat as focused when re-reading the world.
 *
 * `workspace.activeWindow` is the right answer when it is a real window, but
 * it is often the wallpaper — hiding windows leaves nothing focused, and the
 * desktop takes over. Falling back to a window the user can actually see
 * matters most in Stage, where the focused window picks the visible stage: a
 * stage whose only window the *user* minimized would render an empty canvas.
 */
function focusCandidate(list) {
    var active = workspace.activeWindow;
    if (active && isManaged(active) && !active.minimized) return active;
    for (var i = 0; i < list.length; i++) {
        if (isManaged(list[i]) && !list[i].minimized) return list[i];
    }
    return null;
}

function rebuild() {
    var list = workspace.windowList();
    for (var i = 0; i < list.length; i++) {
        attach(list[i], { focus: false });
    }
    var focus = focusCandidate(list);
    if (focus) {
        var cell = cellOf(focus);
        controller.focusWindow(ctl, cell.workspaceId, cell.outputId, windowId(focus), {
            screen: screenOf(cell),
        });
    }
    applyAllOutputs({});
}

// --- modes ------------------------------------------------------------------

/**
 * Before leaving Floating, write down where every window actually is. The core
 * cannot see KWin, and this is the geometry PRD §17 promises to give back.
 */
function captureFloatingGeometry(cell) {
    if (controller.mode(ctl, cell.workspaceId, cell.outputId) !== "floating") return;
    var list = workspace.windowList();
    for (var i = 0; i < list.length; i++) {
        var window = list[i];
        if (!isManaged(window) || window.minimized) continue;
        controller.noteGeometry(ctl, windowId(window), rectOf(window));
    }
}

function setMode(name) {
    var cell = currentCell();
    var screen = screenOf(cell);
    captureFloatingGeometry(cell);
    controller.switchMode(ctl, cell.workspaceId, cell.outputId, name, { screen: screen });
    // `force` so that switching *into* Floating restores remembered geometry
    // once — the visible half of the §17 promise.
    applyLayout(cell, { force: true });
    announceMode(name);
}

function cycleMode(delta) {
    var cell = currentCell();
    var screen = screenOf(cell);
    captureFloatingGeometry(cell);
    controller.cycleMode(ctl, cell.workspaceId, cell.outputId, delta, { screen: screen });
    applyLayout(cell, { force: true });
    announceMode(controller.mode(ctl, cell.workspaceId, cell.outputId));
}

/**
 * Tell the shell which mode is active, so the panel selector can show the truth
 * instead of its own guess. KWin scripts cannot own a D-Bus name, but they can
 * call one: the mode selector plasmoid listens on org.koti.ModeSelector.
 */
function announceMode(name) {
    try {
        callDBus(
            "org.koti.ModeSelector",
            "/ModeSelector",
            "org.koti.ModeSelector",
            "modeChanged",
            name,
        );
    } catch (e) {
        // The plasmoid may not be on the panel; the layout still applied.
    }
}

// --- directional focus and movement (PRD §12 keyboard navigation) -----------

function focusDirection(direction) {
    var cell = currentCell();
    if (controller.mode(ctl, cell.workspaceId, cell.outputId) !== "tiling") return;
    var active = workspace.activeWindow;
    if (!active || !isManaged(active)) return;
    var next = controller.focusNeighbour(
        ctl, cell.workspaceId, cell.outputId, windowId(active), direction,
        { screen: screenOf(cell) },
    );
    if (!next) return;
    var window = windowByIdOnCell(next);
    if (window) workspace.activeWindow = window;
}

function moveDirection(direction) {
    var cell = currentCell();
    if (controller.mode(ctl, cell.workspaceId, cell.outputId) !== "tiling") return;
    var active = workspace.activeWindow;
    if (!active || !isManaged(active)) return;
    controller.moveNeighbour(
        ctl, cell.workspaceId, cell.outputId, windowId(active), direction,
        { screen: screenOf(cell) },
    );
    applyLayout(cell, {});
}

// --- click the wallpaper to reveal the desktop (macOS-style) ----------------

var lastActivatedManaged = null;

// KWin scripts see activation, not mouse buttons, so this cannot tell a left
// click on the wallpaper from a right click that only wanted the context menu.
// Both activate the desktop window. Configurable for exactly that reason —
// `readConfig` returns the default until the package ships a config UI.
var revealDesktopOnWallpaperClick = readConfig("revealDesktopOnWallpaperClick", true);

/** Is there anything on screen for a reveal to actually reveal? */
function hasVisibleManagedWindow() {
    var list = workspace.windowList();
    for (var i = 0; i < list.length; i++) {
        if (isManaged(list[i]) && !list[i].minimized) return true;
    }
    return false;
}

function onWindowActivated(window) {
    if (!window) return;
    // Our own layout causes activation changes: minimizing the window that had
    // focus makes KWin activate another one. Reacting to that would switch the
    // active stage mid-layout and re-enter applyLayout for a different stage,
    // which ends with every window placed on the canvas and then hidden again.
    if (applying) return;
    if (isManaged(window)) {
        lastActivatedManaged = windowId(window);
        var cell = cellOf(window);
        controller.focusWindow(ctl, cell.workspaceId, cell.outputId, windowId(window), {
            screen: screenOf(cell),
        });
        applyLayout(cell, {});
        return;
    }
    // Clicking past every window onto the wallpaper is what macOS reads as
    // "show me the desktop". Only ever from a real window, and only when
    // something is actually covering the desktop, so it cannot fire twice or
    // fire into an already-empty screen.
    if (!revealDesktopOnWallpaperClick) return;
    if (window.desktopWindow && lastActivatedManaged !== null && hasVisibleManagedWindow()) {
        lastActivatedManaged = null;
        workspace.slotToggleShowDesktop();
    }
}

// --- workspaces -------------------------------------------------------------

// Set while we are the ones changing KWin's desktop, so the mirror does not
// bounce back and re-apply what it just published.
var mirroring = false;

/**
 * Koti's workspaces live in the controller, one set per output. KWin's virtual
 * desktops cannot do that — the current desktop is global — but panel widgets
 * can read them, so the *active output's* workspace is mirrored onto KWin's
 * current desktop purely so an indicator has something native to show.
 *
 * Managed windows are put on all desktops, so KWin's own desktop switching
 * never hides anything: what is on screen is decided here, not by KWin.
 */
function ensureDesktops(count) {
    try {
        while (workspace.desktops.length < count) {
            workspace.createDesktop(workspace.desktops.length, "Workspace " + (workspace.desktops.length + 1));
        }
    } catch (e) {
        log("could not create virtual desktops for the workspace indicator: " + e);
    }
}

function mirrorToKWin(index) {
    var desktops = workspace.desktops;
    if (index < 1 || index > desktops.length) return;
    if (workspace.currentDesktop === desktops[index - 1]) return;
    mirroring = true;
    try {
        workspace.currentDesktop = desktops[index - 1];
    } catch (e) {
        log("could not mirror workspace " + index + ": " + e);
    } finally {
        mirroring = false;
    }
}

/** Give focus to something on this output, so a switch does not land nowhere. */
function focusOnOutput(outputId) {
    var cell = { workspaceId: controller.currentWorkspace(ctl, outputId), outputId: outputId };
    var focused = controller.focusedWindow(ctl, cell.workspaceId, cell.outputId);
    var candidates = controller.windows(ctl, cell.workspaceId, cell.outputId);
    var wanted = focused && candidates.indexOf(focused) !== -1 ? focused : candidates[candidates.length - 1];
    if (!wanted) return;
    var window = windowByIdOnCell(wanted);
    if (window && !window.minimized) workspace.activeWindow = window;
}

function goToWorkspace(index) {
    var outputId = String(workspace.activeScreen.name);
    controller.setCurrentWorkspace(ctl, outputId, index);
    applyOutput(outputId, { force: true });
    mirrorToKWin(controller.currentWorkspace(ctl, outputId));
    focusOnOutput(outputId);
    log("workspace " + controller.currentWorkspace(ctl, outputId) + " on " + outputId);
}

function cycleWorkspace(delta) {
    var outputId = String(workspace.activeScreen.name);
    var count = 9;
    var current = controller.currentWorkspace(ctl, outputId);
    goToWorkspace(((current - 1 + delta + count) % count) + 1);
}

/** hyprland's movetoworkspace / movetoworkspacesilent. */
function moveActiveToWorkspace(index, follow) {
    var window = workspace.activeWindow;
    if (!window || !isManaged(window)) return;
    var outputId = outputIdOf(window);
    var moved = controller.moveWindowToWorkspace(
        ctl, outputId, windowId(window), index,
        { screen: screenOf({ workspaceId: index, outputId: outputId }) },
    );
    if (moved === null) return;
    applyOutput(outputId, { force: true });
    if (follow) goToWorkspace(moved);
    else focusOnOutput(outputId);
}

// --- placement actions (Raycast-style) --------------------------------------

/** "almost-maximize" → "Almost Maximize", for the shortcut's display name. */
function actionLabel(action) {
    var words = action.split("-");
    for (var i = 0; i < words.length; i++) {
        words[i] = words[i].charAt(0).toUpperCase() + words[i].slice(1);
    }
    return words.join(" ");
}

function runAction(action) {
    var window = workspace.activeWindow;
    if (!window || !isManaged(window)) return;
    var cell = cellOf(window);
    var rect = controller.applyAction(
        ctl, cell.workspaceId, cell.outputId, windowId(window), action,
        { screen: screenOf(cell), frame: rectOf(window) },
    );
    // null means the active mode places windows itself, so the action has
    // nothing to act on — leave the window alone rather than fight the layout.
    if (!rect) return;
    applying = true;
    try {
        setGeometry(window, rect);
    } finally {
        applying = false;
    }
}

/** Minimize everything except the active window (Raycast's Hide Others). */
function hideOthers() {
    var active = workspace.activeWindow;
    if (!active || !isManaged(active)) return;
    var activeId = windowId(active);
    var list = workspace.windowList();
    for (var i = 0; i < list.length; i++) {
        var window = list[i];
        if (!isManaged(window) || windowId(window) === activeId) continue;
        if (!window.minimized && window.minimizable) window.minimized = true;
    }
}

function showAll() {
    var list = workspace.windowList();
    for (var i = 0; i < list.length; i++) {
        if (isManaged(list[i]) && list[i].minimized) list[i].minimized = false;
    }
}

// --- init -------------------------------------------------------------------

function bindShortcuts() {
    var modes = ["floating", "tiling", "scrolling", "stage"];
    var labels = ["Floating", "Tiling", "Scrolling", "Stage"];
    for (var i = 0; i < modes.length; i++) {
        (function (mode, label) {
            registerShortcut(
                "Koti Layout " + label,
                "Koti: switch this workspace to " + label + " layout",
                "",
                function () { setMode(mode); },
            );
        })(modes[i], labels[i]);
    }
    registerShortcut("Koti Layout Next", "Koti: next layout mode", "", function () { cycleMode(1); });
    registerShortcut("Koti Layout Previous", "Koti: previous layout mode", "", function () { cycleMode(-1); });

    // Every placement action gets a shortcut. Unbound by default apart from
    // the three Mariano already had on NixOS — the rest are discoverable and
    // bindable in System Settings → Shortcuts → KWin, which is what makes the
    // whole set customizable from the KDE GUI without any config file.
    var defaultKeys = {
        "center": "Alt+[",
        "almost-maximize": "Alt+]",
    };
    var actionList = controller.ACTIONS;
    for (var a = 0; a < actionList.length; a++) {
        (function (action) {
            registerShortcut(
                "Koti " + actionLabel(action),
                "Koti: " + actionLabel(action).toLowerCase() + " the active window",
                defaultKeys[action] || "",
                function () { runAction(action); },
            );
        })(actionList[a]);
    }
    registerShortcut("Koti Hide Others", "Koti: hide every other window", "Alt+'", hideOthers);
    registerShortcut("Koti Show All", "Koti: restore every hidden window", "", showAll);

    // Workspaces, bound the way hyprland and niri bind them. Meta+N goes to a
    // workspace on the *focused monitor* only; the other monitor keeps its own.
    for (var n = 1; n <= 9; n++) {
        (function (index) {
            registerShortcut(
                "Koti Workspace " + index,
                "Koti: go to workspace " + index + " on this monitor",
                "Meta+" + index,
                function () { goToWorkspace(index); },
            );
            registerShortcut(
                "Koti Move To Workspace " + index,
                "Koti: move the window to workspace " + index,
                "Meta+Shift+" + index,
                function () { moveActiveToWorkspace(index, false); },
            );
            registerShortcut(
                "Koti Move To Workspace " + index + " And Follow",
                "Koti: move the window to workspace " + index + " and follow it",
                "",
                function () { moveActiveToWorkspace(index, true); },
            );
        })(n);
    }
    registerShortcut("Koti Workspace Next", "Koti: next workspace on this monitor",
        "Meta+Ctrl+Right", function () { cycleWorkspace(1); });
    registerShortcut("Koti Workspace Previous", "Koti: previous workspace on this monitor",
        "Meta+Ctrl+Left", function () { cycleWorkspace(-1); });

    var directions = ["left", "right", "up", "down"];
    var keys = ["Left", "Right", "Up", "Down"];
    for (var d = 0; d < directions.length; d++) {
        (function (direction, keyName) {
            registerShortcut(
                "Koti Focus " + keyName,
                "Koti: focus the window " + direction,
                "Meta+Alt+" + keyName,
                function () { focusDirection(direction); },
            );
            registerShortcut(
                "Koti Move " + keyName,
                "Koti: move the window " + direction,
                "Meta+Alt+Shift+" + keyName,
                function () { moveDirection(direction); },
            );
        })(directions[d], keys[d]);
    }
}

export function init() {
    ensureDesktops(9);

    workspace.windowAdded.connect(attach);
    workspace.windowRemoved.connect(detach);
    workspace.windowActivated.connect(onWindowActivated);
    workspace.screensChanged.connect(rebuild);

    // A desktop change we did not cause came from the panel indicator, so it
    // means "switch the focused monitor to that workspace".
    workspace.currentDesktopChanged.connect(function () {
        if (mirroring || applying) return;
        var outputId = String(workspace.activeScreen.name);
        var index = workspace.currentDesktop.x11DesktopNumber;
        if (!index) return;
        controller.setCurrentWorkspace(ctl, outputId, index);
        applyOutput(outputId, { force: true });
        focusOnOutput(outputId);
    });

    bindShortcuts();
    rebuild();
    mirrorToKWin(controller.currentWorkspace(ctl, String(workspace.activeScreen.name)));
}

if (typeof workspace !== "undefined") {
    init();
}
