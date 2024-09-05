#![allow(dead_code)]
#![allow(non_snake_case)]
#![recursion_limit = "256"]

use std::path::PathBuf;

use anyhow::Result;

#[cfg(feature = "appdeps")]
pub mod config;
#[cfg(feature = "appdeps")]
pub mod covau_types;
#[cfg(feature = "appdeps")]
pub mod db;
#[cfg(feature = "appdeps")]
pub mod mbz;
#[cfg(feature = "appdeps")]
pub mod musimanager;
#[cfg(feature = "appdeps")]
pub mod server;
#[cfg(feature = "appdeps")]
pub mod yt;

#[cfg(all(feature = "appdeps", feature = "native-player"))]
pub mod musiplayer;

#[cfg(feature = "appdeps")]
mod native;
#[cfg(feature = "appdeps")]
pub use native::*;

#[cfg(feature = "wasmdeps")]
#[allow(unused_imports)]
mod wasm;
#[cfg(feature = "wasmdeps")]
pub use wasm::*;

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
