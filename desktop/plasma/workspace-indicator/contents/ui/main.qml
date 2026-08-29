/*
 * Koti workspace indicator — the workspace number, the way a hyprland or niri
 * bar shows it.
 *
 * Koti's workspaces are per monitor and live in the window-policy KWin script,
 * which cannot own a D-Bus name to publish them. What it can do is mirror the
 * *focused* monitor's workspace onto KWin's virtual desktop, which every Plasma
 * component already watches. So this reads VirtualDesktopInfo — no polling, no
 * custom protocol — and clicking a number switches the desktop, which the
 * script sees and applies to the focused monitor.
 *
 * The consequence worth knowing: this shows the focused monitor's workspace.
 * On a two-monitor setup it follows whichever monitor you are working on.
 */

import QtQuick
import QtQuick.Layouts
import org.kde.plasma.components as PC3
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasmoid
import org.kde.taskmanager as TaskManager
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root

    TaskManager.VirtualDesktopInfo {
        id: desktops
    }

    readonly property int currentIndex: {
        for (var i = 0; i < desktops.desktopIds.length; i++) {
            if (desktops.desktopIds[i] === desktops.currentDesktop) {
                return i
            }
        }
        return 0
    }

    preferredRepresentation: fullRepresentation
    toolTipMainText: i18n("Workspace %1", root.currentIndex + 1)
    toolTipSubText: i18n("Meta+1…9 switches this monitor's workspace; Meta+Shift+1…9 moves the window")

    fullRepresentation: RowLayout {
        id: row
        spacing: Kirigami.Units.smallSpacing

        Repeater {
            model: desktops.desktopIds

            delegate: PC3.Label {
                id: pip
                required property int index
                required property var modelData

                readonly property bool isCurrent: root.currentIndex === index

                text: index + 1
                // The current workspace is stated plainly; the rest recede
                // rather than disappear, so the row does not jump about.
                opacity: isCurrent ? 1.0 : 0.45
                font.weight: isCurrent ? Font.Bold : Font.Normal
                font.pointSize: Kirigami.Theme.defaultFont.pointSize
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignVCenter

                Layout.preferredWidth: Math.max(
                    implicitWidth + Kirigami.Units.smallSpacing * 2,
                    Kirigami.Units.gridUnit)
                Layout.fillHeight: true

                Behavior on opacity {
                    NumberAnimation { duration: Kirigami.Units.shortDuration }
                }

                MouseArea {
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: desktops.requestActivate(pip.modelData)
                    onEntered: if (!pip.isCurrent) pip.opacity = 0.75
                    onExited: if (!pip.isCurrent) pip.opacity = 0.45
                }
            }
        }
    }
}
