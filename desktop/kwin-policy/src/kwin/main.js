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

// Re-entrancy guard: we move windows, KWin tells us windows moved, and without
// this we would answer our own notification forever.
var applying = false;

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
    if (window.skipTaskbar || window.specialWindow) return false;
    if (window.fullScreen) return false; // a fullscreen window owns its output
    return true;
}

function cellOf(window) {
    var desktop = window.desktops && window.desktops.length > 0
        ? window.desktops[0]
        : workspace.currentDesktop;
    var output = window.output || workspace.activeScreen;
    return { workspaceId: String(desktop.id), outputId: String(output.name) };
}

function currentCell() {
    return {
        workspaceId: String(workspace.currentDesktop.id),
        outputId: String(workspace.activeScreen.name),
    };
}

/** The placement area: the screen minus panels and struts. */
function screenOf(cell) {
    var output = outputByName(cell.outputId);
    var desktop = desktopById(cell.workspaceId);
    var area = workspace.clientArea(KWin.PlacementArea, output, desktop);
    return { x: area.x, y: area.y, width: area.width, height: area.height };
}

function outputByName(name) {
    var screens = workspace.screens;
    for (var i = 0; i < screens.length; i++) {
        if (String(screens[i].name) === name) return screens[i];
    }
    return workspace.activeScreen;
}

function desktopById(id) {
    var desktops = workspace.desktops;
    for (var i = 0; i < desktops.length; i++) {
        if (String(desktops[i].id) === id) return desktops[i];
    }
    return workspace.currentDesktop;
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
                if (!window.minimized && window.minimizable) window.minimized = true;
                continue;
            }
            if (window.minimized) window.minimized = false;
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

function relayoutCurrent() {
    applyLayout(currentCell(), {});
}

// --- window bookkeeping -----------------------------------------------------

// Windows we have already wired signals to. Without this, every rebuild()
// would connect another copy of each handler to the same window.
var connected = {};

function attach(window) {
    if (!isManaged(window)) return;
    var id = windowId(window);
    var cell = cellOf(window);
    // Pass the live geometry every time, not just on windowAdded: windows that
    // existed before the script loaded arrive through rebuild(), and without
    // their geometry the §17 floating restore has nothing to restore to.
    controller.addWindow(ctl, cell.workspaceId, cell.outputId, id, {
        geometry: rectOf(window),
    });

    if (connected[id]) return;
    connected[id] = true;

    // A window the user drags or resizes has just told us where it wants to be;
    // that is the floating geometry §17 restores later.
    window.interactiveMoveResizeFinished.connect(function () {
        if (applying) return;
        controller.noteGeometry(ctl, id, rectOf(window));
        applyLayout(cellOf(window), {});
    });

    window.outputChanged.connect(function () {
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
    controller.removeWindow(ctl, cell.workspaceId, cell.outputId, id);
    applyLayout(cell, {});
}

/** Re-derive membership from scratch — cheap, and the honest answer after any
 *  change we did not observe directly (output changes, desktop moves). */
function rebuild() {
    var list = workspace.windowList();
    for (var i = 0; i < list.length; i++) {
        attach(list[i]);
    }
    relayoutCurrent();
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
    workspace.windowAdded.connect(attach);
    workspace.windowRemoved.connect(detach);
    workspace.windowActivated.connect(onWindowActivated);
    workspace.currentDesktopChanged.connect(relayoutCurrent);
    workspace.screensChanged.connect(rebuild);

    bindShortcuts();
    rebuild();
}

if (typeof workspace !== "undefined") {
    init();
}
