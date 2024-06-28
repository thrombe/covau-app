#![allow(dead_code)]
#![allow(non_snake_case)]

// :skull. warp types got so huge that it refuses too compile
#![recursion_limit = "256"]

use std::path::PathBuf;

use anyhow::Result;

// TODO:
// create a nix style symlinked artist/songs, album/songs, artist/albums, etc
// but store all songs in a single directory
//
// do things like stremio
// - rust + wasm
// - have UI model types be created and sent from wasm to ts
//
// - virtual scrolling but paged
//  - ff basically does not seem to need virtual scrolling (except for memory usage (cheap))
//  - chrome (and ff to a lesser degree) does not like frequent DOM changes
//    - just change the virtual scrolling to add/remove items in big chunks
//
// - frontend as a server for backend
// - saving stuff
// - packaging
//
// add autoplay
//  - QueueManager has a AutoPlay Searcher
//    - autoplay on
//      - related on last item in queue
//      - search last item's artist :/
//      - is this api free? https://listenbrainz.org/explore/lb-radio/
//    - it also manages a field with next_item in this searcher
//    - store the Queue items list as Unique<ListItem | QueuOptions, string>
//      - second last item always next item to play (by autoplay) (grayed)
//      - last item always this options
//
//  - transaction for database over api

pub mod covau_types;
pub mod db;
pub mod mbz;
pub mod musimanager;
mod musiplayer;
pub mod server;
pub mod webui;
pub mod yt;

fn dump_types() -> Result<()> {
    let tsconfig = specta::ts::ExportConfiguration::default();
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

    // dbg!(ulid::Ulid::new().to_string());

    // parse_test().await?;
    // db::db_test().await?;
    // mbz::api_test().await?;
    // std::process::exit(1);

    #[cfg(build_mode = "DEV")]
    dump_types()?;

    #[cfg(ui_backend = "WEBUI")]
    webui_app().await?;
    #[cfg(not(ui_backend = "WEBUI"))]
    server_start().await?;

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
