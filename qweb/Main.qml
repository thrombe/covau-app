import QtQuick
import QtQuick.Window
import QtWebEngine

Window {
    width: 640
    height: 480
    visible: true
    title: qsTr("Covau!")
    WebEngineView {
        anchors.fill: parent
        url: "http://localhost:6175/#/local"
    }
}
