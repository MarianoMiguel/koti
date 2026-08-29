// Koti default shell layout (PRD §9, Default Shell Layout v1.3).
// macOS-like: slim transparent top bar (tray right), centered floating dock.
//
// Plasma global-theme layout script. Exact panel-styling scripting properties
// (opacity/floating) are Plasma-6 APIs — validated on-device (task M5-06);
// guards keep the layout usable if an older API surface is present.

// ── Top bar ─────────────────────────────────────────────────────────────────
var topBar = new Panel;
topBar.location = "top";
topBar.height = Math.round(gridUnit * 1.6); // slim, Apple-like
if ("floating" in topBar) topBar.floating = false;   // full-width strip
if ("opacity" in topBar) topBar.opacity = "translucent";

// Left: launcher + global application menu (Apple-style menus in the bar).
topBar.addWidget("org.kde.plasma.kickoff");
topBar.addWidget("org.kde.plasma.appmenu");

topBar.addWidget("org.kde.plasma.panelspacer");

// Right, in order: layout-mode widget (PRD §16) beside the tray, then clock.
// org.koti.modeselector ships in the same image (desktop/plasma/mode-selector).
topBar.addWidget("org.koti.modeselector");
topBar.addWidget("org.kde.plasma.systemtray");
topBar.addWidget("org.kde.plasma.digitalclock");

// ── Dock ────────────────────────────────────────────────────────────────────
var dock = new Panel;
dock.location = "bottom";
dock.alignment = "center";
if ("lengthMode" in dock) dock.lengthMode = "fit";   // hug the icons
if ("floating" in dock) dock.floating = true;        // detached, dock-like
if ("opacity" in dock) dock.opacity = "translucent";
dock.height = Math.round(gridUnit * 3);

var tasks = dock.addWidget("org.kde.plasma.icontasks");
tasks.currentConfigGroup = ["General"];
tasks.writeConfig("launchers", [
    "preferred://browser",
    "preferred://filemanager",
    "applications:org.kde.konsole.desktop",
    "applications:org.kde.systemsettings.desktop"
].join(","));
