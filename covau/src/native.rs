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

#[cfg(target_os = "android")]
pub fn serve() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(100)
        .enable_all()
        .build()
        .unwrap();
    let _guard = rt.enter();

    log::error!("starting tokio");
    rt.block_on(tokio::spawn(async move {
        log::error!("spawned tokio");
        let config = config::Config::default().derived()?;
        let config = std::sync::Arc::new(config);

        log::error!("starting server");
        server_start(config).await?;

        Ok::<(), anyhow::Error>(())
    }))
    .unwrap()
    .unwrap();
}

pub fn dump_types() -> Result<()> {
    let tsconfig =
        specta::ts::ExportConfiguration::default().bigint(specta::ts::BigIntExportBehavior::String);
    let types_dir = PathBuf::from("./ui/src/types");
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
