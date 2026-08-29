/*
 * Koti layout-mode selector (PRD §16): sits in the top bar's right-hand group,
 * next to the tray, COSMIC-style. One click shows the four modes; nobody has to
 * memorize a keybinding per mode.
 *
 * How it drives the window policy: the KWin script (org.koti.windowpolicy)
 * registers one global shortcut per mode, and this invokes them through
 * KGlobalAccel. That is the only channel a plasmoid and a KWin script share —
 * a KWin script cannot own a D-Bus name of its own — and it has the useful
 * side effect that every mode is also bindable to a key in System Settings.
 */

import QtQuick
import QtQuick.Layouts
import org.kde.plasma.components as PC3
import org.kde.plasma.plasmoid
import org.kde.plasma.plasma5support as P5Support
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root

    readonly property string currentMode: Plasmoid.configuration.mode

    readonly property var modes: [
        { id: "floating",  label: i18n("Floating"),  shortcut: "Koti Layout Floating",  icon: "window",           hint: i18n("Windows move freely") },
        { id: "tiling",    label: i18n("Tiling"),    shortcut: "Koti Layout Tiling",    icon: "view-grid",        hint: i18n("Windows tile automatically") },
        { id: "scrolling", label: i18n("Scrolling"), shortcut: "Koti Layout Scrolling", icon: "sidebar-expand",   hint: i18n("Windows on an endless strip") },
        { id: "stage",     label: i18n("Stage"),     shortcut: "Koti Layout Stage",     icon: "window-duplicate", hint: i18n("Windows grouped into Stages") }
    ]

    function modeById(id) {
        for (var i = 0; i < modes.length; i++) {
            if (modes[i].id === id) {
                return modes[i]
            }
        }
        return modes[0]
    }

    // Fire-and-forget: every source is disconnected as soon as it reports, so
    // repeated switches do not pile up executable sources.
    P5Support.DataSource {
        id: executable
        engine: "executable"
        connectedSources: []
        onNewData: function (source, data) {
            disconnectSource(source)
        }
    }

    function applyMode(id) {
        var name = root.modeById(id).shortcut
        executable.connectSource(
            "gdbus call --session --dest org.kde.kglobalaccel"
            + " --object-path /component/kwin"
            + " --method org.kde.kglobalaccel.Component.invokeShortcut "
            + "'" + name + "'")
    }

    function selectMode(id) {
        Plasmoid.configuration.mode = id
        applyMode(id)
    }

    // The KWin script is loaded by the compositor, which may not have got there
    // by the time the panel is up; a short delay makes login restore reliable
    // without the plasmoid having to watch for KWin.
    Timer {
        id: restoreTimer
        interval: 4000
        repeat: false
        onTriggered: {
            if (Plasmoid.configuration.restoreOnLogin && root.currentMode !== "floating") {
                root.applyMode(root.currentMode)
            }
        }
    }

    Component.onCompleted: {
        Plasmoid.globalShortcut = "Meta+Shift+Space" // PRD §16 suggested accelerator
        restoreTimer.start()
    }

    preferredRepresentation: compactRepresentation
    toolTipMainText: i18n("Layout: %1", modeById(currentMode).label)
    toolTipSubText: i18n("Click to change how windows arrange on this workspace")

    compactRepresentation: PC3.ToolButton {
        icon.name: root.modeById(root.currentMode).icon
        onClicked: root.expanded = !root.expanded
    }

    fullRepresentation: ColumnLayout {
        spacing: Kirigami.Units.smallSpacing
        Layout.minimumWidth: Kirigami.Units.gridUnit * 12

        PC3.Label {
            text: i18n("Layout")
            font.weight: Font.DemiBold
            Layout.margins: Kirigami.Units.smallSpacing
        }

        Repeater {
            model: root.modes

            delegate: PC3.ToolButton {
                required property var modelData

                Layout.fillWidth: true
                icon.name: modelData.icon
                text: modelData.label
                checkable: true
                checked: root.currentMode === modelData.id
                PC3.ToolTip.text: modelData.hint
                PC3.ToolTip.visible: hovered

                onClicked: {
                    root.selectMode(modelData.id)
                    root.expanded = false
                }
            }
        }
    }
}
