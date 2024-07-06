#![allow(dead_code)]
#![allow(non_snake_case)]

use std::{path::PathBuf, sync::Arc};

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

    use anyhow::Context;
    use clap::{arg, command, Parser, Subcommand};
    use serde::{Deserialize, Serialize};

    #[derive(Deserialize, Debug, Clone, Default)]
    #[serde(default, deny_unknown_fields)]
    pub struct Config {
        /// where to store music data
        pub music_path: Option<String>,

        /// where to store app data and logs
        /// ~/.local/share/covau by default
        pub data_path: Option<String>,

        /// where to store temporary cache
        /// ~/.cache/covau
        pub cache_path: Option<String>,

        pub musimanager_db_path: Option<String>,

        pub run_in_background: bool,
        // TODO:
        // pub webui_port: Option<u16>,
        // pub server_port: Option<u16>,
    }
    impl Config {
        pub fn derived(self) -> anyhow::Result<DerivedConfig> {
            let home_dir = dirs::home_dir().context("can't find home directory")?;
            let data_path = dirs::data_dir().context("can't find data dir")?;
            let cache_path = dirs::cache_dir().context("can't find cache dir")?;

            let data_path = self
                .data_path
                .as_ref()
                .map(|p| shellexpand::tilde_with_context(p, || Some(home_dir.to_string_lossy())))
                .map(|s| s.to_string())
                .map(PathBuf::from)
                .map(|p| {
                    p.exists()
                        .then_some(p)
                        .context("provided data_path does not exist")
                })
                .transpose()?
                .unwrap_or(data_path.join("covau"));
            let _ = std::fs::create_dir(&data_path);

            let db_path = data_path.join("db");
            let _ = std::fs::create_dir(&db_path);

            let log_path = data_path.join("logs");
            let _ = std::fs::create_dir(&log_path);

            let cache_path = self
                .cache_path
                .as_ref()
                .map(|p| shellexpand::tilde_with_context(p, || Some(home_dir.to_string_lossy())))
                .map(|s| s.to_string())
                .map(PathBuf::from)
                .map(|p| {
                    p.exists()
                        .then_some(p)
                        .context("provided cache_path does not exist")
                })
                .transpose()?
                .unwrap_or(cache_path.join("covau"));
            let _ = std::fs::create_dir(&cache_path);

            let musimanager_db_path = self
                .musimanager_db_path
                .as_ref()
                .map(|p| shellexpand::tilde_with_context(p, || Some(home_dir.to_string_lossy())))
                .map(|s| s.to_string())
                .map(PathBuf::from)
                .map(|p| {
                    p.exists()
                        .then_some(p)
                        .context("provided musimanager_db_path does not exist")
                })
                .transpose()?;

            let music_path = self
                .musimanager_db_path
                .as_ref()
                .map(|p| shellexpand::tilde_with_context(p, || Some(home_dir.to_string_lossy())))
                .map(|s| s.to_string())
                .map(PathBuf::from)
                .map(|p| {
                    p.exists()
                        .then_some(p)
                        .context("provided music_path does not exist")
                })
                .transpose()?
                .unwrap_or(data_path.join("music"));
            let _ = std::fs::create_dir(&music_path);

            let config = DerivedConfig {
                run_in_background: self.run_in_background,
                db_path,
                log_path,
                music_path,
                musimanager_db_path,
                data_path,
                cache_path,
                config: self,
            };
            Ok(config)
        }
    }
    #[derive(Deserialize, Debug, Clone)]
    pub struct DerivedConfig {
        pub config: Config,
        pub data_path: PathBuf,
        pub cache_path: PathBuf,

        pub db_path: PathBuf,
        pub log_path: PathBuf,
        pub music_path: PathBuf,
        pub musimanager_db_path: Option<PathBuf>,
        pub run_in_background: bool,
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
        Webui {
            #[arg(long, short, default_value_t = false)]
            run_in_background: bool,
        },
        Default {
            #[cfg(ui_backend = "WEBUI")]
            #[arg(long, short, default_value_t = false)]
            run_in_background: bool,
        },
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
            #[cfg(build_mode = "PRODUCTION")]
            let filename = "config.toml";

            #[cfg(build_mode = "DEV")]
            let filename = "configd.toml";

            let mut config = self
                .config_dir
                .clone()
                .map(PathBuf::from)
                .or(dirs::config_dir().map(|pb| pb.join("covau")))
                .map(|pb| pb.join(filename))
                .filter(|p| p.exists())
                .map(std::fs::read_to_string)
                .transpose()?
                .map(|s| toml::from_str::<Config>(&s))
                .transpose()?
                .unwrap_or(Config::default());

            let _ = self.command.as_ref().map(|c| match c {
                Command::Webui { run_in_background } => {
                    config.run_in_background = *run_in_background;
                }
                Command::Server => {
                    config.run_in_background = true;
                }
                #[cfg(ui_backend = "WEBUI")]
                Command::Default { run_in_background } => {
                    config.run_in_background = *run_in_background;
                }
                _ => {}
            });

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

async fn webui_app(config: Arc<cli::DerivedConfig>) -> Result<()> {
    let app = webui::App::new();

    #[cfg(build_mode = "DEV")]
    let port: u16 = core::env!("DEV_VITE_PORT").parse().unwrap();
    #[cfg(build_mode = "PRODUCTION")]
    let port: u16 = core::env!("SERVER_PORT").parse().unwrap();

    let mut url = format!("http://localhost:{}/", port);

    url += "#/local";
    // url += "#/vibe/test";
    // url += "#/play";

    let mut server_fut = std::pin::pin!(server_start(config));
    let mut app_fut = std::pin::pin!(app.open_window(url));

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

async fn server_start(config: Arc<cli::DerivedConfig>) -> Result<()> {
    server::start(
        "127.0.0.1".parse()?,
        core::env!("SERVER_PORT").parse().unwrap(),
        config,
    )
    .await;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = cli::Cli::parse();
    let config = cli.config()?.derived()?;
    let config = Arc::new(config);

    init_logger(&config.log_path)?;

    match cli.command.clone().unwrap_or(cli::Command::Default {
        #[cfg(ui_backend = "WEBUI")]
        run_in_background: config.run_in_background,
    }) {
        cli::Command::Server => {
            #[cfg(build_mode = "DEV")]
            dump_types()?;

            server_start(config).await?;
        }
        cli::Command::Webui { .. } => {
            #[cfg(build_mode = "DEV")]
            dump_types()?;

            webui_app(config).await?;
        }
        cli::Command::Default { .. } => {
            #[cfg(build_mode = "DEV")]
            dump_types()?;

            #[cfg(ui_backend = "WEBUI")]
            webui_app(config).await?;
            #[cfg(not(ui_backend = "WEBUI"))]
            server_start(config).await?;
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
