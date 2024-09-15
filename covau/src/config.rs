use std::path::PathBuf;

use anyhow::Context;
use clap::{arg, Subcommand};
use serde::{Deserialize, Serialize};

use crate::covau_types::{SourcePath, SourcePathType};

#[derive(Deserialize, Debug, Clone, Default)]
#[serde(deny_unknown_fields)]
pub struct MusimanagerConfig<P> {
    pub enable: bool,
    pub db_path: P,
    pub music_path: P,
    pub temp_music_path: P,
}

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

    pub musimanager: Option<MusimanagerConfig<String>>,

    pub run_in_background: bool,
    pub server_port: Option<u16>,
}
impl Config {
    #[cfg(not(target_os = "android"))]
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

        let musimanager = if let Some(m) = &self.musimanager {
            let db_path = m.db_path.as_str();
            let db_path =
                shellexpand::tilde_with_context(db_path, || Some(home_dir.to_string_lossy()));
            let db_path = PathBuf::from(db_path.to_string());
            let _ = db_path
                .exists()
                .then_some(())
                .context("provided musimanager db_path does not exist")?;

            let music_path = m.music_path.as_str();
            let music_path =
                shellexpand::tilde_with_context(music_path, || Some(home_dir.to_string_lossy()));
            let music_path = PathBuf::from(music_path.to_string());
            let _ = music_path
                .exists()
                .then_some(())
                .context("provided musimanager music_path does not exist")?;

            let temp_music_path = m.temp_music_path.as_str();
            let temp_music_path = shellexpand::tilde_with_context(temp_music_path, || {
                Some(home_dir.to_string_lossy())
            });
            let temp_music_path = PathBuf::from(temp_music_path.to_string());
            let _ = temp_music_path
                .exists()
                .then_some(())
                .context("provided musimanager temp_music_path does not exist")?;

            Some(MusimanagerConfig {
                enable: m.enable,
                db_path,
                music_path,
                temp_music_path,
            })
        } else {
            None
        };

        let music_path = self
            .music_path
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
            musimanager,
            data_path,
            cache_path,
            server_port: self
                .server_port
                .unwrap_or(core::env!("SERVER_PORT").parse().unwrap()),
            #[cfg(build_mode = "DEV")]
            dev_vite_port: std::env::var("DEV_VITE_PORT")?
                .parse()
                .context("could not parse dev port")?,
            config: self,
        };
        Ok(config)
    }

    #[cfg(target_os = "android")]
    pub fn derived(self, data_dir: String) -> anyhow::Result<DerivedConfig> {
        // TODO: use config file data
        let data_dir = PathBuf::from(data_dir);

        let data_path = data_dir.join("data");
        let _ = std::fs::create_dir(&data_path);

        let cache_path = data_dir.join("cache");
        let _ = std::fs::create_dir(&cache_path);

        let db_path = data_path.join("db");
        let _ = std::fs::create_dir(&db_path);

        let log_path = data_path.join("logs");
        let _ = std::fs::create_dir(&log_path);

        let musimanager = None;

        let music_path = data_path.join("music");
        let _ = std::fs::create_dir(&music_path);

        let config = DerivedConfig {
            run_in_background: self.run_in_background,
            db_path,
            log_path,
            music_path,
            musimanager,
            data_path,
            cache_path,
            server_port: self
                .server_port
                .unwrap_or(core::env!("SERVER_PORT").parse().unwrap()),
            #[cfg(build_mode = "DEV")]
            dev_vite_port: std::env::var("DEV_VITE_PORT")?
                .parse()
                .context("could not parse dev port")?,
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

    pub musimanager: Option<MusimanagerConfig<PathBuf>>,

    pub run_in_background: bool,
    pub server_port: u16,

    #[cfg(build_mode = "DEV")]
    pub dev_vite_port: u16,
}

impl DerivedConfig {
    pub fn source_path(&self, typ: SourcePathType, path: String) -> anyhow::Result<SourcePath> {
        let path = match typ {
            SourcePathType::MusimanagerMusic => SourcePath {
                typ: SourcePathType::MusimanagerMusic,
                path: path
                    .strip_prefix(
                        self.musimanager
                            .as_ref()
                            .context("musimanager not set in config")?
                            .music_path
                            .to_string_lossy()
                            .as_ref(),
                    )
                    .context("wrong path")?
                    .into(),
            },
            SourcePathType::MusimanagerTemp => SourcePath {
                typ: SourcePathType::MusimanagerMusic,
                path: path
                    .strip_prefix(
                        self.musimanager
                            .as_ref()
                            .context("musimanager not set in config")?
                            .temp_music_path
                            .to_string_lossy()
                            .as_ref(),
                    )
                    .context("wrong path")?
                    .into(),
            },
            SourcePathType::CovauMusic => SourcePath {
                typ: SourcePathType::CovauMusic,
                path: path
                    .strip_prefix(self.music_path.to_string_lossy().as_ref())
                    .context("wrong path")?
                    .into(),
            },
            SourcePathType::Absolute => SourcePath {
                typ: SourcePathType::Absolute,
                path,
            },
        };
        Ok(path)
    }
    pub fn to_path(&self, path: SourcePath) -> anyhow::Result<PathBuf> {
        let path = match path.typ {
            SourcePathType::MusimanagerMusic => self
                .musimanager
                .as_ref()
                .context("musimanager music path not in config")?
                .music_path
                .join(path.path),
            SourcePathType::MusimanagerTemp => self
                .musimanager
                .as_ref()
                .context("musimanager temp music path not in config")?
                .temp_music_path
                .join(path.path),
            SourcePathType::CovauMusic => self.music_path.join(path.path),
            SourcePathType::Absolute => path.path.into(),
        };
        Ok(path)
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
    Repeat,
    ToggleMute,
    TogglePlay,
    BlacklistArtists,
    RemoveAndNext,
    SeekFwd,
    SeekBkwd,
    Message {
        #[arg(long, short)]
        message: String,

        #[arg(long, short, default_value_t = false)]
        error: bool,
    },
}
