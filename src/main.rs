#![allow(dead_code)]
#![allow(non_snake_case)]

use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;

pub mod covau_types;
pub mod db;
pub mod mbz;
pub mod musimanager;
mod musiplayer;
pub mod server;
pub mod webui;
pub mod yt;

pub mod cli {
    use std::path::PathBuf;

    use clap::{arg, command, Parser, Subcommand};
    use serde::{Deserialize, Serialize};

    #[derive(Deserialize, Debug, Clone)]
    #[serde(default, deny_unknown_fields)]
    pub struct Config {
        pub music_path: Option<String>,
    }
    impl Default for Config {
        fn default() -> Self {
            Self { music_path: None }
        }
    }

    #[derive(Subcommand, Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
    #[serde(tag = "type", content = "content")]
    pub enum FeCommand {
        Like,
        Dislike,
        Next,
        Prev,
        Pause,
        Play,
        ToggleMute,
        TogglePlay,
        Message {
            #[arg(long, short)]
            message: String,

            #[arg(long, short, default_value_t = false)]
            error: bool,
        },
    }

    #[derive(Subcommand, Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
    pub enum Command {
        FeCommand {
            #[command(subcommand)]
            command: FeCommand,
        },
        Server,
        Webui,
        Default,
        Test,
    }

    #[derive(Parser, Debug, Clone)]
    #[command(author, version, about)]
    pub struct Cli {
        /// Specify a custom config directory
        #[arg(short, long)]
        pub config_dir: Option<String>,

        #[arg(long, short, default_value_t = false)]
        pub debug: bool,

        #[command(subcommand)]
        pub command: Option<Command>,
    }

    impl Cli {
        pub fn config(&self) -> anyhow::Result<Config> {
            let config = self
                .config_dir
                .clone()
                .map(PathBuf::from)
                .or(dirs::config_dir().map(|pb| pb.join("covau")))
                .map(|pb| pb.join("config.toml"))
                .filter(|p| p.exists())
                .map(std::fs::read_to_string)
                .transpose()?
                .map(|s| toml::from_str::<Config>(&s))
                .transpose()?
                .unwrap_or(Config::default());
            Ok(config)
        }
    }
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

async fn webui_app() -> Result<()> {
    let app = webui::App::new();

    #[cfg(build_mode = "DEV")]
    let port: u16 = core::env!("DEV_VITE_PORT").parse().unwrap();
    #[cfg(build_mode = "PRODUCTION")]
    let port: u16 = core::env!("SERVER_PORT").parse().unwrap();

    let mut url = format!("http://localhost:{}/", port);

    url += "#/local";
    // url += "#/vibe/test";
    // url += "#/play";

    tokio::select! {
        server = server_start() => {
            app.close();
            server?;
        }
        window = app.open_window(url) => {
            app.close();
            window?;
        }
    }

    Ok(())
}

async fn server_start() -> Result<()> {
    server::start(
        "127.0.0.1".parse()?,
        core::env!("SERVER_PORT").parse().unwrap(),
    )
    .await;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    init_logger("./")?;

    let cli = cli::Cli::parse();

    match cli.command.clone().unwrap_or(cli::Command::Default) {
        cli::Command::Server => {
            server_start().await?;
        }
        cli::Command::Webui => {
            webui_app().await?;
        }
        cli::Command::Default => {
            #[cfg(build_mode = "DEV")]
            dump_types()?;

            #[cfg(ui_backend = "WEBUI")]
            webui_app().await?;
            #[cfg(not(ui_backend = "WEBUI"))]
            server_start().await?;
        }
        cli::Command::FeCommand { command } => {
            let fereq = match command {
                cli::FeCommand::Like => server::FeRequest::Like,
                cli::FeCommand::Dislike => server::FeRequest::Dislike,
                cli::FeCommand::Next => server::FeRequest::Next,
                cli::FeCommand::Prev => server::FeRequest::Prev,
                cli::FeCommand::Pause => server::FeRequest::Pause,
                cli::FeCommand::Play => server::FeRequest::Play,
                cli::FeCommand::ToggleMute => server::FeRequest::ToggleMute,
                cli::FeCommand::TogglePlay => server::FeRequest::TogglePlay,
                cli::FeCommand::Message { message, error } => {
                    if error {
                        server::FeRequest::NotifyError(message)
                    } else {
                        server::FeRequest::Notify(message)
                    }
                }
            };

            let client = reqwest::Client::new();
            let port: u16 = core::env!("SERVER_PORT").parse().unwrap();
            let req = client
                .post(format!("http://localhost:{}/cli", port))
                .body(serde_json::to_string(&fereq)?)
                .timeout(std::time::Duration::from_secs(5))
                .build()?;

            match client.execute(req).await {
                Ok(resp) => {
                    // server responded with something

                    let status = resp.status();
                    let res = resp.error_for_status_ref();
                    match res {
                        Ok(_resp) => {
                            println!("Ok");
                        }
                        Err(e) => match resp.json::<server::ErrorMessage>().await {
                            Ok(errmsg) => {
                                if cli.debug {
                                    return Err(anyhow::anyhow!(errmsg.stack_trace));
                                } else {
                                    return Err(anyhow::anyhow!(errmsg.message));
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
        }
    }

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
