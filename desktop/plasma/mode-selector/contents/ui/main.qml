/*
 * Koti layout-mode selector (PRD §16): lives at the top right beside the
 * system tray. One click opens the four modes; no per-mode keybinding to
 * memorize.
 *
 * Wiring to the window-policy layer (KWin script) lands with M5-01: the
 * plasmoid will read/set the active cell's mode over the policy script's
 * D-Bus surface. Until then it holds local state so the UX is reviewable.
 */

import QtQuick
import QtQuick.Layouts
import org.kde.plasma.components as PC3
import org.kde.plasma.plasmoid
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root

    property string currentMode: "floating"

    readonly property var modes: [
        { id: "floating",  label: i18n("Floating"),  icon: "window",             hint: i18n("Windows move freely") },
        { id: "tiling",    label: i18n("Tiling"),    icon: "view-grid",          hint: i18n("Windows tile automatically") },
        { id: "scrolling", label: i18n("Scrolling"), icon: "sidebar-expand",     hint: i18n("Windows on an endless strip") },
        { id: "stage",     label: i18n("Stage"),     icon: "window-duplicate",   hint: i18n("Windows grouped into Stages") }
    ]

    function modeById(id) {
        for (var i = 0; i < modes.length; i++) {
            if (modes[i].id === id) {
                return modes[i]
            }
        }
        return modes[0]
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
                    // M5-01: forward to the window-policy script instead of
                    // only storing locally.
                    root.currentMode = modelData.id
                    root.expanded = false
                }
            }
        }
    }
}
