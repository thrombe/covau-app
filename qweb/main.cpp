#include <QApplication>
// #include <QQmlApplicationEngine>
#include <QtWebEngineQuick/QtWebEngineQuick>
#include <QtWebEngineWidgets/QWebEngineView>

#include "main.h"
#include "./ui_main.h"

Covau::Covau(QWidget *parent)
    : QMainWindow(parent)
    , ui(new Ui::Covau)
{
    ui->setupUi(this);
}

Covau::~Covau()
{
    delete ui;
}


int main(int argc, char *argv[])
{
    // QtWebEngineQuick::initialize();

    QApplication a(argc, argv);

    // QQmlApplicationEngine engine;
    // engine.load(QUrl("qrc:/main.qml"));

    Covau w;
    auto parent = w.centralWidget();
    // auto parent = w.parentWidget();

    QWebEngineView *view = new QWebEngineView(parent);
    view->load(QUrl("http://localhost:6175/#/local/"));
    view->show();

    w.show();

    return a.exec();
}
