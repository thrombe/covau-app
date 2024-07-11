#include <QGuiApplication>
#include <QApplication>
#include <QQmlApplicationEngine>
#include <QtCore/qlocale.h>
#include <QtWebEngineQuick>
#include <clocale>
#include <QWebEngineView>

int main(int argc, char *argv[]) {
    qputenv("QTWEBENGINE_CHROMIUM_FLAGS", "--autoplay-policy=no-user-gesture-required");

    QtWebEngineQuick::initialize();

    QApplication app(argc, argv);

    QWebEngineView view;
    QQmlApplicationEngine engine;

    printf("args: %d\n", argc);

    if (argc > 1) {
        printf("%s\n", argv[1]);
        view.load(QUrl(argv[1]));
        view.resize(1024, 750);
        view.show();
    } else {
        const QUrl url(u"qrc:/files/Main.qml"_qs);
        QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed,
            &app, []() { QCoreApplication::exit(-1); },
            Qt::QueuedConnection);
        engine.load(url);
    }

    return app.exec();
}

std::thread* t = nullptr;
extern "C" void qweb_start() {
    QLocale::setDefault(QLocale::C);
    // std::setlocale(LC_NUMERIC, "C");

    t = new std::thread( [&] {
        std::string s = "";
        char *argv2[] = { s.begin().base() };
        int argc2 = 1;

        QGuiApplication app(argc2, argv2);
        std::setlocale(LC_NUMERIC, "C");

        QQmlApplicationEngine engine;
        const QUrl url(u"qrc:/files/Main.qml"_qs);
        // const QUrl url(u"file:///home/issac/0Git/covau-app/qweb/Main.qml"_qs);
        QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed,
            &app, []() { QCoreApplication::exit(-1); },
            Qt::QueuedConnection);
        engine.load(url);

        return app.exec();
    });
}
extern "C" void qweb_wait() {
    t->join();
    delete t;
}

