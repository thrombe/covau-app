#ifndef COVAU_H
#define COVAU_H

#include <QMainWindow>

QT_BEGIN_NAMESPACE
namespace Ui { class Covau; }
QT_END_NAMESPACE

class Covau : public QMainWindow
{
    Q_OBJECT

public:
    Covau(QWidget *parent = nullptr);
    ~Covau();

private:
    Ui::Covau *ui;
};
#endif // COVAU_H
