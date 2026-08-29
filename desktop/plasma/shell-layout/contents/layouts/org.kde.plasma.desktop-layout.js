// Koti default shell layout (PRD §9, Default Shell Layout v1.3).
//
// macOS-like: slim top bar with the tray group right-aligned, and a centered
// dock at the bottom. COSMIC-like: the layout-mode selector sits in the top
// bar's right-hand group, next to the tray, not hidden in a menu.
//
// This one script is the single source of the layout. It runs in two places:
//   - Plasma applies it when the Koti Global Theme is selected with
//     "Desktop layout" checked (look-and-feel layout script);
//   - `koti-shell-apply` feeds it to a live session over
//     org.kde.PlasmaShell.evaluateScript.
// It is therefore written to be idempotent: it tears down existing panels
// first, so running it twice yields one top bar and one dock, not four.

// ── Reset ───────────────────────────────────────────────────────────────────
// Applying a look-and-feel layout starts from a clean slate, but a live apply
// does not. Removing first is what makes re-running safe.
var existing = panels();
for (var i = 0; i < existing.length; i++) {
    existing[i].remove();
}

// A spacer that actually pushes: the applet defaults to a fixed gap, so the
// expanding flag has to be written explicitly or the tray will not sit right.
function addExpandingSpacer(panel) {
    var spacer = panel.addWidget("org.kde.plasma.panelspacer");
    spacer.currentConfigGroup = ["General"];
    spacer.writeConfig("expanding", true);
    return spacer;
}

// Not every Plasma build exposes every panel property to scripting; missing
// ones must not abort the script and leave a half-built shell.
function setIfSupported(panel, prop, value) {
    try {
        if (prop in panel) {
            panel[prop] = value;
        }
    } catch (e) {
        print("koti-layout: could not set " + prop + ": " + e);
    }
}

// ── Top bar ─────────────────────────────────────────────────────────────────
var topBar = new Panel;
topBar.location = "top";
topBar.height = Math.round(gridUnit * 1.6); // slim, Apple-like
setIfSupported(topBar, "lengthMode", "fill"); // edge-to-edge strip
setIfSupported(topBar, "floating", false);
setIfSupported(topBar, "opacity", "translucent");

// Left: launcher, then the global application menu where macOS puts it.
topBar.addWidget("org.kde.plasma.kickoff");
topBar.addWidget("org.kde.plasma.appmenu");

addExpandingSpacer(topBar);

// Right-hand group, COSMIC-style: layout mode, tray, clock. The mode selector
// ships with the image (desktop/plasma/mode-selector); if it is missing —
// older image, first boot after a rebase — the rest of the bar must still come
// up, so the add is guarded.
try {
    topBar.addWidget("org.koti.modeselector");
} catch (e) {
    print("koti-layout: org.koti.modeselector not installed, skipping: " + e);
}
topBar.addWidget("org.kde.plasma.systemtray");
topBar.addWidget("org.kde.plasma.digitalclock");

// ── Dock ────────────────────────────────────────────────────────────────────
// Centered and hugging its icons: `fit` sizes the panel to its contents and
// `center` puts it in the middle of the bottom edge, which is the dock look.
// Where `fit` is unavailable the panel fills the edge, so spacers on either
// side of the tasks widget keep the icons centered regardless.
var dock = new Panel;
dock.location = "bottom";
dock.height = Math.round(gridUnit * 3);
setIfSupported(dock, "alignment", "center");
setIfSupported(dock, "lengthMode", "fit");
setIfSupported(dock, "floating", true);
setIfSupported(dock, "opacity", "translucent");

var dockFits = ("lengthMode" in dock) && dock.lengthMode === "fit";
if (!dockFits) {
    addExpandingSpacer(dock);
}

var tasks = dock.addWidget("org.kde.plasma.icontasks");
tasks.currentConfigGroup = ["General"];
tasks.writeConfig("launchers", [
    "preferred://browser",
    "preferred://filemanager",
    "applications:org.kde.konsole.desktop",
    "applications:org.kde.dolphin.desktop",
    "applications:org.kde.systemsettings.desktop"
].join(","));
// A dock shows what is running, on every desktop — not just this one.
tasks.writeConfig("showOnlyCurrentDesktop", false);
tasks.writeConfig("showOnlyCurrentActivity", false);

if (!dockFits) {
    addExpandingSpacer(dock);
}
