#include <QApplication>

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
    QApplication a(argc, argv);
    Covau w;
    w.show();
    return a.exec();
}
