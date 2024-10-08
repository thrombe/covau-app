use std::sync::Arc;

use libcovau::{anyhow, anyhow::Result, clap::Parser, config, server_start, tokio};

#[cfg(build_mode = "DEV")]
use libcovau::dump_types;

mod cli;

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
async fn qweb_app(config: Arc<config::DerivedConfig>) -> Result<()> {
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
        let mut child = tokio::process::Command::new("qweb");
        let mut child2 = child
            .arg(url)
            .stdout(std::process::Stdio::inherit())
            .stderr(std::process::Stdio::inherit())
            .spawn()?;

        let mut server_fut = std::pin::pin!(server_start(config.clone()));

        tokio::select! {
            server = &mut server_fut => {
                child2.kill().await?;
                server?;
                return Ok(());
            }
            window = child2.wait() => {
                let _ = window?;
            }
        }

        if config.run_in_background {
            server_fut.await?;
        }
    }

    Ok::<_, anyhow::Error>(())
}

#[cfg(feature = "tao-wry")]
mod tao_wry {
    use std::sync::Arc;

    use tao::event_loop::EventLoopBuilder;

    use crate::{cli, server_start};

    use super::*;

    fn wry_open(url: String) -> wry::Result<()> {
        use tao::{
            event::{Event, StartCause, WindowEvent},
            event_loop::ControlFlow,
            window::WindowBuilder,
        };
        use wry::WebViewBuilder;

        #[cfg(target_os = "linux")]
        use tao::platform::unix::EventLoopBuilderExtUnix;
        #[cfg(target_os = "windows")]
        use tao::platform::windows::EventLoopBuilderExtWindows;

        let event_loop = EventLoopBuilder::new().with_any_thread(true).build();
        let window = WindowBuilder::new()
            .with_title("Covau")
            .build(&event_loop)
            .unwrap();

        #[cfg(target_os = "windows")]
        let builder = WebViewBuilder::new(&window);
        #[cfg(target_os = "linux")]
        let builder = {
            use tao::platform::unix::WindowExtUnix;
            use wry::WebViewBuilderExtUnix;
            let vbox = window.default_vbox().unwrap();
            WebViewBuilder::new_gtk(vbox)
        };

        let _webview = builder.with_url(url).build()?;

        event_loop.run(move |event, _, control_flow| {
            *control_flow = ControlFlow::Wait;

            match event {
                Event::NewEvents(StartCause::Init) => println!("Wry has started!"),
                Event::WindowEvent {
                    event: WindowEvent::CloseRequested,
                    ..
                } => *control_flow = ControlFlow::Exit,
                _ => (),
            }
        });
    }

    pub async fn app(conf: Arc<config::DerivedConfig>) -> anyhow::Result<()> {
        #[cfg(build_mode = "DEV")]
        let port = conf.dev_vite_port;
        #[cfg(build_mode = "PROD")]
        let port = conf.server_port;

        let mut url = format!("http://localhost:{}/", port);

        url += "#/local";
        // url += "#/vibe/test";
        // url += "#/play";

        let mut app_fut = std::pin::pin!(tokio::task::spawn_blocking(move || {
            wry_open(url)?;
            Ok::<_, anyhow::Error>(())
        }));
        let mut server_fut = std::pin::pin!(server_start(conf.clone()));

        tokio::select! {
            server = &mut server_fut => {
                server?;
                return Ok(());
            }
            window = &mut app_fut => {
                let _ = window?;
            }
        }

        if conf.run_in_background {
            server_fut.await?;
        }

        Ok(())
    }
}

#[tokio::main(flavor = "multi_thread", worker_threads = 100)]
async fn main() -> Result<()> {
    let cli = cli::Cli::parse();
    let config = cli.config()?.derived()?;
    let config = Arc::new(config);

    // init_logger(&config.log_path)?;

    match cli.command.clone().unwrap_or(cli::Command::Default {
        #[cfg(any(ui_backend = "QWEB", ui_backend = "TAO-WRY"))]
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
        #[cfg(feature = "tao-wry")]
        cli::Command::TaoWry { .. } => {
            #[cfg(build_mode = "DEV")]
            dump_types()?;

            tao_wry::app(config).await?;
        }
        cli::Command::Default { .. } => {
            #[cfg(build_mode = "DEV")]
            dump_types()?;

            #[cfg(ui_backend = "TAO-WRY")]
            tao_wry::app(config).await?;
            #[cfg(ui_backend = "QWEB")]
            qweb_app(config).await?;
            #[cfg(ui_backend = "NONE")]
            server_start(config).await?;
        }
        cli::Command::FeCommand { command } => {
            libcovau::run_command(config.server_port, cli.debug, command).await?;
        }
        cli::Command::Test => {
            // dbg!(ulid::Ulid::new().to_string());

            // parse_test().await?;
            // db::db_test().await?;
            // mbz::api_test().await?;
        }
    }

    Ok(())
}
