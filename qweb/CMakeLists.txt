cmake_minimum_required(VERSION 3.16)

project(qweb VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Set up Clangd
find_program(CLANGD clangd)
if(CLANGD)
    add_definitions(-DUSE_CLANGD)
endif()
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

find_package(Qt6 REQUIRED COMPONENTS Quick)
find_package(Qt6 REQUIRED COMPONENTS WebEngineQuick)

qt_standard_project_setup()

qt_add_executable(appqweb
    main.cpp
)

qt_add_qml_module(appqweb
    URI qweb
    VERSION 1.0
    QML_FILES Main.qml
)

qt_add_library(qweb SHARED main.cpp)
# qt_add_library(qweb STATIC main.cpp)
target_link_libraries(qweb PRIVATE Qt6::Quick)
target_link_libraries(qweb PRIVATE Qt6::WebEngineQuick)
install(TARGETS qweb
    BUNDLE DESTINATION .
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)

# Qt for iOS sets MACOSX_BUNDLE_GUI_IDENTIFIER automatically since Qt 6.1.
# If you are developing for iOS or macOS you should consider setting an
# explicit, fixed bundle identifier manually though.
set_target_properties(appqweb PROPERTIES
#    MACOSX_BUNDLE_GUI_IDENTIFIER com.example.appqweb
    MACOSX_BUNDLE_BUNDLE_VERSION ${PROJECT_VERSION}
    MACOSX_BUNDLE_SHORT_VERSION_STRING ${PROJECT_VERSION_MAJOR}.${PROJECT_VERSION_MINOR}
    MACOSX_BUNDLE TRUE
    WIN32_EXECUTABLE TRUE
)

target_link_libraries(appqweb PRIVATE Qt6::Quick)
target_link_libraries(appqweb PRIVATE Qt6::WebEngineQuick)

include(GNUInstallDirs)
install(TARGETS appqweb
    BUNDLE DESTINATION .
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)
