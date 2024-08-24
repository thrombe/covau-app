#![allow(dead_code)]
#![allow(non_snake_case)]
#![recursion_limit = "256"]

use std::{path::PathBuf, process::Stdio, sync::Arc};

use anyhow::Result;
use clap::Parser;

pub mod cli;
pub mod covau_types;
pub mod db;
pub mod mbz;
pub mod musimanager;
mod musiplayer;
pub mod server;
pub mod yt;

#[cfg(feature = "webui")]
pub mod webui;

#[cfg(feature = "qweb-dylib")]
mod qweb {
    mod sys {
        #[link(name = "qweb", kind = "dylib")]
        extern "C" {
            pub fn qweb_start();
            pub fn qweb_wait();
        }
    }

    pub fn start() {
        unsafe {
            sys::qweb_start();
        }
    }

    pub fn wait() {
        unsafe {
            sys::qweb_wait();
        }
    }
}

#[cfg(any(feature = "qweb-dylib", feature = "qweb-bin"))]
async fn qweb_app(config: Arc<cli::DerivedConfig>) -> Result<()> {
    #[cfg(build_mode = "DEV")]
    let port = config.dev_vite_port;
    #[cfg(build_mode = "PROD")]
    let port = config.server_port;

    let mut url = format!("http://localhost:{}/", port);

    url += "#/local";
    // url += "#/vibe/test";
    // url += "#/play";

    #[cfg(feature = "qweb-dylib")]
    {
        let start_notif = std::sync::Arc::new(tokio::sync::Notify::new());
        let quit_notif = std::sync::Arc::new(tokio::sync::Notify::new());

        let start_n = start_notif.clone();
        let quit_n = quit_notif.clone();
        let j = tokio::task::spawn_blocking(move || {
            qweb::start();
            start_n.notify_waiters();
            qweb::wait();
            quit_n.notify_waiters();
        });

        start_notif.notified().await;

        let mut server_fut = std::pin::pin!(server_start(config));

        tokio::select! {
            server = &mut server_fut => {
                server?;
                return Ok(());
            }
            window = quit_notif.notified() => { }
        }
        let _ = j.await;

        if config.run_in_background {
            server_fut.await?;
        }
    };

    #[cfg(feature = "qweb-bin")]
    {
        let mut app_fut = std::pin::pin!(tokio::task::spawn(async {
            let mut child = tokio::process::Command::new("qweb");
            let child2 = child
                .arg(url)
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .spawn()?;
            let _s = child2.wait_with_output().await?;
            Ok::<_, anyhow::Error>(())
        }));
        let mut server_fut = std::pin::pin!(server_start(config.clone()));

        tokio::select! {
            server = &mut server_fut => {
                server?;
                return Ok(());
            }
            window = &mut app_fut => {
                let _ = window?;
            }
        }

        if config.run_in_background {
            server_fut.await?;
        }
    }

    Ok(())
}

#[cfg(feature = "webui")]
async fn webui_app(config: Arc<cli::DerivedConfig>) -> Result<()> {
    let app = webui::App::new();

    #[cfg(build_mode = "DEV")]
    let port = config.dev_vite_port;
    #[cfg(build_mode = "PROD")]
    let port = config.server_port;

    let mut url = format!("http://localhost:{}/", port);

    url += "#/local";
    // url += "#/vibe/test";
    // url += "#/play";

    let mut app_fut = std::pin::pin!(app.open_window(url, config.webui_port));
    let mut server_fut = std::pin::pin!(server_start(config));

    tokio::select! {
        server = &mut server_fut => {
            app.close();
            server?;
            return Ok(());
        }
        window = &mut app_fut => {
            // app.close();
            window?;
        }
    }

    let res = server_fut.await;
    app.close();
    res?;

    Ok(())
}

#[cfg(feature = "webview")]
fn webview_app(config: Arc<cli::DerivedConfig>) -> Result<()> {
    #[cfg(build_mode = "DEV")]
    let port = config.dev_vite_port;
    #[cfg(build_mode = "PROD")]
    let port = config.server_port;

    let mut url = format!("http://localhost:{}/", port);

    url += "#/local";
    // url += "#/vibe/test";
    // url += "#/play";

    web_view::builder()
        .title("covau")
        .content(web_view::Content::Url(url))
        .debug(true)
        .invoke_handler(|_wv, _arg| Ok(()))
        .user_data(())
        .run()?;

    // let (tx, mut rx) = tokio::sync::oneshot::channel();
    // let (close_tx, mut close_rx) = tokio::sync::oneshot::channel();
    // let mut server_fut = std::pin::pin!(server_start(config));
    // // let mut app_fut = tokio::task::spawn_blocking(move || {
    // // });
    // let j = std::thread::spawn(move || {
    //     let mut app = web_view::builder()
    //         .title("covau")
    //         .content(web_view::Content::Url(url))
    //         .debug(true)
    //         .invoke_handler(|_wv, _arg| Ok(()))
    //         .user_data(())
    //         .build()?;

    //         let res = loop {
    //             match close_rx.try_recv() {
    //                 Ok(()) => {
    //                     break Ok(());
    //                 },
    //                 Err(tokio::sync::oneshot::error::TryRecvError::Empty) => (),
    //                 Err(tokio::sync::oneshot::error::TryRecvError::Closed) => break Err(anyhow::anyhow!("channel closed")),
    //             }
    //             match app.step() {
    //                 Some(Ok(_)) => (),
    //                 Some(Err(e)) => break Err(anyhow::anyhow!("some webbview error")),
    //                 None => {
    //                     tx.send(Ok(()));
    //                     return Ok(());
    //                 },
    //             }
    //         };
    //         // app.exit();
    //         tx.send(res);
    //         Ok::<_, anyhow::Error>(())
    // });

    // tokio::select! {
    //     server = &mut server_fut => {
    //         app.exit();
    //         server?;
    //         return Ok(());
    //     }
    //     window = &mut rx => {
    //         // app.close();
    //         window??;
    //     }
    // }

    // let res = server_fut.await;
    // res?;

    // rx.await??;

    // j.join();
    Ok(())
}

#[cfg(feature = "webview")]
fn webview_test() {
    web_view::builder()
        // .title("Minimal webview example")
        .content(web_view::Content::Html("https://en.m.wikipedia.org/wiki/Main_Page"))
        // .size(800, 600)
        // .resizable(true)
        // .debug(true)
        .user_data(())
        .invoke_handler(|_webview, _arg| Ok(()))
        .run()
        .unwrap();
}

async fn server_start(config: Arc<cli::DerivedConfig>) -> Result<()> {
    server::start("127.0.0.1".parse()?, config.server_port, config).await;
    Ok(())
}

#[tokio::main(flavor = "multi_thread", worker_threads = 100)]
async fn main() -> Result<()> {
    let cli = cli::Cli::parse();
    let config = cli.config()?.derived()?;
    let config = Arc::new(config);

    // init_logger(&config.log_path)?;

    match cli.command.clone().unwrap_or(cli::Command::Default {
        #[cfg(ui_backend = "WEBUI")]
        run_in_background: config.run_in_background,
    }) {
        cli::Command::Server => {
            #[cfg(build_mode = "DEV")]
            dump_types()?;

            server_start(config).await?;
        }
        #[cfg(any(feature = "qweb-dylib", feature = "qweb-bin"))]
        cli::Command::Qweb { .. } => {
            #[cfg(build_mode = "DEV")]
            dump_types()?;

            qweb_app(config).await?;
        }
        #[cfg(feature = "webui")]
        cli::Command::Webui { .. } => {
            #[cfg(build_mode = "DEV")]
            dump_types()?;

            webui_app(config).await?;
        }
        cli::Command::Default { .. } => {
            #[cfg(build_mode = "DEV")]
            dump_types()?;

            #[cfg(ui_backend = "QWEB")]
            qweb_app(config).await?;
            #[cfg(ui_backend = "WEBUI")]
            webui_app(config).await?;
            #[cfg(ui_backend = "NONE")]
            server_start(config).await?;
        }
        cli::Command::FeCommand { command } => {
            use crate::server::routes::FeRequest;
            use crate::server::ErrorMessage;

            let fereq = match command {
                cli::FeCommand::Like => FeRequest::Like,
                cli::FeCommand::Dislike => FeRequest::Dislike,
                cli::FeCommand::Next => FeRequest::Next,
                cli::FeCommand::Prev => FeRequest::Prev,
                cli::FeCommand::Pause => FeRequest::Pause,
                cli::FeCommand::Play => FeRequest::Play,
                cli::FeCommand::Repeat => FeRequest::Repeat,
                cli::FeCommand::ToggleMute => FeRequest::ToggleMute,
                cli::FeCommand::TogglePlay => FeRequest::TogglePlay,
                cli::FeCommand::BlacklistArtists => FeRequest::BlacklistArtists,
                cli::FeCommand::RemoveAndNext => FeRequest::RemoveAndNext,
                cli::FeCommand::SeekFwd => FeRequest::SeekFwd,
                cli::FeCommand::SeekBkwd => FeRequest::SeekBkwd,
                cli::FeCommand::Message { message, error } => {
                    if error {
                        FeRequest::NotifyError(message)
                    } else {
                        FeRequest::Notify(message)
                    }
                }
            };

            let client = reqwest::Client::new();
            let port = config.server_port;
            let req = client
                .post(format!("http://localhost:{}/cli", port))
                .body(serde_json::to_string(&fereq)?)
                .timeout(std::time::Duration::from_secs(5))
                .build()?;

            match client.execute(req).await {
                Ok(resp) => {
                    // server responded with something

                    let res = resp.error_for_status_ref();
                    match res {
                        Ok(_resp) => {
                            println!("Ok");
                        }
                        Err(_) => match resp.json::<ErrorMessage>().await {
                            Ok(errmsg) => {
                                if cli.debug {
                                    return Err(anyhow::anyhow!(format!("{:?}", errmsg)));
                                } else {
                                    return Err(anyhow::anyhow!(format!("{}", errmsg)));
                                }
                            }
                            Err(e) => {
                                if cli.debug {
                                    eprintln!("{:?}", e);
                                    return Err(e.into());
                                } else {
                                    return Err(e.into());
                                }
                            }
                        },
                    }
                }
                Err(e) => {
                    // timeout error and stuff
                    return Err(e.into());
                }
            }
        }
        cli::Command::Test => {
            // dbg!(ulid::Ulid::new().to_string());

            // parse_test().await?;
            // db::db_test().await?;
            // mbz::api_test().await?;

            // #[cfg(feature = "webview")]
            // webview_app(config)?;

            #[cfg(feature = "webview")]
            webview_test();
        }
    }

    Ok(())
}

fn dump_types() -> Result<()> {
    let tsconfig =
        specta::ts::ExportConfiguration::default().bigint(specta::ts::BigIntExportBehavior::String);
    let types_dir = PathBuf::from("./electron/src/types");
    let _ = std::fs::create_dir(&types_dir);
    std::fs::write(
        types_dir.join("musimanager.ts"),
        musimanager::dump_types(&tsconfig)?,
    )?;
    std::fs::write(
        types_dir.join("covau.ts"),
        covau_types::dump_types(&tsconfig)?,
    )?;
    std::fs::write(types_dir.join("server.ts"), server::dump_types(&tsconfig)?)?;
    std::fs::write(types_dir.join("db.ts"), db::dump_types(&tsconfig)?)?;
    std::fs::write(types_dir.join("mbz.ts"), mbz::dump_types(&tsconfig)?)?;
    std::fs::write(types_dir.join("yt.ts"), yt::dump_types(&tsconfig)?)?;

    Ok(())
}

pub fn init_logger(log_dir: impl Into<PathBuf>) -> Result<()> {
    let mut base_config = fern::Dispatch::new();

    base_config = match 3 {
        0 => {
            // Let's say we depend on something which whose "info" level messages are too
            // verbose to include in end-user output. If we don't need them,
            // let's not include them.
            base_config
                .level(log::LevelFilter::Info)
                .level_for("overly-verbose-target", log::LevelFilter::Warn)
        }
        1 => base_config
            .level(log::LevelFilter::Debug)
            .level_for("overly-verbose-target", log::LevelFilter::Info),
        2 => base_config.level(log::LevelFilter::Debug),
        _3_or_more => base_config.level(log::LevelFilter::Trace),
    };

    let log_file = log_dir.into().join("log.log");
    let _ = std::fs::remove_file(&log_file);
    let file_config = fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "[{}] [{}:{}] [{}] {}",
                record.level(),
                record.file().unwrap_or("no file"),
                record.line().unwrap_or(0),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs_f64(),
                message,
            ))
        })
        .chain(fern::log_file(&log_file)?);

    base_config.chain(file_config).apply()?;

    Ok(())
}
