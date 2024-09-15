use std::{path::PathBuf, sync::Arc};

use anyhow::Result;

pub use anyhow;
pub use clap;
pub use dirs;
pub use reqwest;
pub use serde;
pub use serde_json;
pub use tokio;

use crate::{config, covau_types, db, mbz, musimanager, server, yt};

pub async fn server_start(conf: Arc<config::DerivedConfig>) -> Result<()> {
    server::start("127.0.0.1".parse()?, conf.server_port, conf).await?;
    Ok(())
}

pub async fn run_command(server_port: u16, debug: bool, command: config::FeCommand) -> anyhow::Result<()> {
    use server::routes::FeRequest;
    use server::ErrorMessage;

    let fereq = match command {
        config::FeCommand::Like => FeRequest::Like,
        config::FeCommand::Dislike => FeRequest::Dislike,
        config::FeCommand::Next => FeRequest::Next,
        config::FeCommand::Prev => FeRequest::Prev,
        config::FeCommand::Pause => FeRequest::Pause,
        config::FeCommand::Play => FeRequest::Play,
        config::FeCommand::Repeat => FeRequest::Repeat,
        config::FeCommand::ToggleMute => FeRequest::ToggleMute,
        config::FeCommand::TogglePlay => FeRequest::TogglePlay,
        config::FeCommand::BlacklistArtists => FeRequest::BlacklistArtists,
        config::FeCommand::RemoveAndNext => FeRequest::RemoveAndNext,
        config::FeCommand::SeekFwd => FeRequest::SeekFwd,
        config::FeCommand::SeekBkwd => FeRequest::SeekBkwd,
        config::FeCommand::Message { message, error } => {
            if error {
                FeRequest::NotifyError(message)
            } else {
                FeRequest::Notify(message)
            }
        }
    };

    let client = reqwest::Client::new();
    let port = server_port;
    let req = client
        .post(format!("http://localhost:{}/cli", port))
        .body(serde_json::to_string(&fereq)?)
        .timeout(std::time::Duration::from_secs(5))
        .build()?;

    let debug = debug;
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
                        if debug {
                            return Err(anyhow::anyhow!(format!("{:?}", errmsg)));
                        } else {
                            return Err(anyhow::anyhow!(format!("{}", errmsg)));
                        }
                    }
                    Err(e) => {
                        if debug {
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

    Ok(())
}

#[cfg(target_os = "android")]
pub fn command(cmd: config::FeCommand) -> anyhow::Result<()> {
    tokio::runtime::Runtime::new()?.block_on(async move {
        run_command(core::env!("SERVER_PORT").parse().unwrap(), true, cmd).await
    })
}

#[cfg(target_os = "android")]
pub fn serve(data_dir: String) -> anyhow::Result<()> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(100)
        .enable_all()
        .build()
        .unwrap();
    let _guard = rt.enter();

    rt.block_on(tokio::spawn(async move {
        log::error!("spawned tokio");
        // TODO: config file stuff
        let config = config::Config::default().derived(data_dir)?;
        let config = std::sync::Arc::new(config);

        log::error!("starting server {}", config.server_port);
        server_start(config).await?;

        Ok::<(), anyhow::Error>(())
    }))??;

    Ok(())
}

pub fn dump_types() -> Result<()> {
    let tsconfig =
        specta::ts::ExportConfiguration::default().bigint(specta::ts::BigIntExportBehavior::String);
    let types_dir = PathBuf::from(format!("{}/ui/src/types", core::env!("PROJECT_ROOT")));
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
