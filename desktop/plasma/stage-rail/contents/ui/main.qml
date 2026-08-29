/*
 * Koti stage rail (PRD §14) — the stages that are not on the canvas, down the
 * left edge, the way Stage Manager shows them.
 *
 * Where the data comes from, and its one honest limitation:
 *
 * A KWin script cannot own a D-Bus name, so the window-policy script cannot
 * publish its stage grouping to a panel widget. What *is* reactive and stock is
 * TasksModel grouped by application — and Koti's stages are per application by
 * default, so grouping windows by app reproduces the stages exactly for the
 * common case. Clicking a card activates that app's window, and the policy
 * script switches to that window's stage, so the rail drives the real thing
 * rather than a copy of it.
 *
 * Where it diverges: if you regroup stages by hand (Meta+Alt+N to split a
 * window onto its own stage, Meta+Alt+G to merge), the rail still groups by
 * app and will show that differently from the layout. Tracked in M5-02.
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

    readonly property int cardSize: Kirigami.Units.gridUnit * 3.5

    TaskManager.TasksModel {
        id: tasks
        // One row per application is what makes a row a stage.
        groupMode: TaskManager.TasksModel.GroupApplications
        groupInline: false
        sortMode: TaskManager.TasksModel.SortVirtualDesktop
        filterByVirtualDesktop: false
        filterByScreen: false
        filterByActivity: true
        filterNotMinimized: false
        virtualDesktop: virtualDesktopInfo.currentDesktop
        activity: activityInfo.currentActivity
    }

    TaskManager.VirtualDesktopInfo { id: virtualDesktopInfo }
    TaskManager.ActivityInfo { id: activityInfo }

    preferredRepresentation: fullRepresentation
    toolTipMainText: i18n("Stages")
    toolTipSubText: i18n("The apps not on the canvas. Click one to bring its stage forward.")

    fullRepresentation: Item {
        implicitWidth: root.cardSize + Kirigami.Units.smallSpacing * 2
        implicitHeight: Math.max(root.cardSize, column.implicitHeight)

        ColumnLayout {
            id: column
            anchors.fill: parent
            anchors.margins: Kirigami.Units.smallSpacing
            spacing: Kirigami.Units.smallSpacing

            Repeater {
                model: tasks

                delegate: Rectangle {
                    id: card
                    required property int index
                    required property var model

                    Layout.fillWidth: true
                    Layout.preferredHeight: root.cardSize

                    // The stage on the canvas is stated; the rest recede.
                    readonly property bool onCanvas: model.IsActive === true

                    radius: Kirigami.Units.cornerRadius ?? 6
                    color: card.onCanvas
                        ? Qt.rgba(Kirigami.Theme.highlightColor.r,
                                  Kirigami.Theme.highlightColor.g,
                                  Kirigami.Theme.highlightColor.b, 0.35)
                        : Qt.rgba(Kirigami.Theme.textColor.r,
                                  Kirigami.Theme.textColor.g,
                                  Kirigami.Theme.textColor.b, hover.hovered ? 0.16 : 0.08)
                    border.width: card.onCanvas ? 1 : 0
                    border.color: Kirigami.Theme.highlightColor

                    Behavior on color {
                        ColorAnimation { duration: Kirigami.Units.shortDuration }
                    }

                    ColumnLayout {
                        anchors.centerIn: parent
                        spacing: 0

                        Kirigami.Icon {
                            source: model.decoration
                            Layout.alignment: Qt.AlignHCenter
                            Layout.preferredWidth: Kirigami.Units.iconSizes.medium
                            Layout.preferredHeight: Kirigami.Units.iconSizes.medium
                            // A stage that is not on the canvas is still there,
                            // just not in front.
                            opacity: card.onCanvas ? 1.0 : 0.7
                        }

                        PC3.Label {
                            text: model.AppName ?? ""
                            Layout.alignment: Qt.AlignHCenter
                            Layout.maximumWidth: root.cardSize - Kirigami.Units.smallSpacing
                            elide: Text.ElideRight
                            horizontalAlignment: Text.AlignHCenter
                            font.pointSize: Kirigami.Theme.smallFont.pointSize
                            opacity: card.onCanvas ? 1.0 : 0.7
                        }
                    }

                    HoverHandler { id: hover }

                    TapHandler {
                        onTapped: tasks.requestActivate(tasks.makeModelIndex(card.index))
                    }

                    PC3.ToolTip.text: model.AppName ?? ""
                    PC3.ToolTip.visible: hover.hovered
                }
            }

            Item { Layout.fillHeight: true }
        }
    }
}
