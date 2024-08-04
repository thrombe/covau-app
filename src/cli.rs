use std::path::PathBuf;

use anyhow::Context;
use clap::{arg, command, Parser, Subcommand};
use serde::{Deserialize, Serialize};

use crate::covau_types::{SourcePath, SourcePathType};

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
    pub musimanager_music_path: Option<String>,
    pub musimanager_temp_music_path: Option<String>,

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
        let musimanager_music_path = self
            .musimanager_music_path
            .as_ref()
            .map(|p| shellexpand::tilde_with_context(p, || Some(home_dir.to_string_lossy())))
            .map(|s| s.to_string())
            .map(PathBuf::from)
            .map(|p| {
                p.exists()
                    .then_some(p)
                    .context("provided musimanager_music_path does not exist")
            })
            .transpose()?;
        let musimanager_temp_music_path = self
            .musimanager_temp_music_path
            .as_ref()
            .map(|p| shellexpand::tilde_with_context(p, || Some(home_dir.to_string_lossy())))
            .map(|s| s.to_string())
            .map(PathBuf::from)
            .map(|p| {
                p.exists()
                    .then_some(p)
                    .context("provided musimanager_temp_music_path does not exist")
            })
            .transpose()?;

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
            musimanager_db_path,
            musimanager_music_path,
            musimanager_temp_music_path,
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
    pub musimanager_music_path: Option<PathBuf>,
    pub musimanager_temp_music_path: Option<PathBuf>,
    pub run_in_background: bool,
}

impl DerivedConfig {
    pub fn source_path(&self, typ: SourcePathType, path: String) -> anyhow::Result<SourcePath> {
        let path = match typ {
            SourcePathType::MusimanagerMusic => SourcePath {
                typ: SourcePathType::MusimanagerMusic,
                path: path
                    .strip_prefix(
                        self.musimanager_music_path
                            .as_ref()
                            .context("musimanager music path not in config")?
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
                        self.musimanager_temp_music_path
                            .as_ref()
                            .context("musimanager temp music path not in config")?
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
                .musimanager_music_path
                .as_ref()
                .context("musimanager music path not in config")?
                .join(path.path),
            SourcePathType::MusimanagerTemp => self
                .musimanager_temp_music_path
                .as_ref()
                .context("musimanager temp music path not in config")?
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

#[derive(Subcommand, Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub enum Command {
    FeCommand {
        #[command(subcommand)]
        command: FeCommand,
    },
    Server,
    #[cfg(feature = "webui")]
    Webui {
        #[arg(long, short, default_value_t = false)]
        run_in_background: bool,
    },
    #[cfg(any(feature = "qweb-dylib", feature = "qweb-bin"))]
    Qweb {
        #[arg(long, short, default_value_t = false)]
        run_in_background: bool,
    },
    Default {
        #[cfg(any(
            all(ui_backend = "WEBUI", feature = "webui"),
            all(ui_backend = "QWEB", feature = "qweb")
        ))]
        #[arg(long, short, default_value_t = false)]
        run_in_background: bool,
    },
    #[clap(hide = true)]
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
            #[cfg(feature = "webui")]
            Command::Webui { run_in_background } => {
                config.run_in_background = *run_in_background;
            }
            #[cfg(any(feature = "qweb-dylib", feature = "qweb-bin"))]
            Command::Qweb { run_in_background } => {
                config.run_in_background = *run_in_background;
            }
            Command::Server => {
                config.run_in_background = true;
            }
            #[cfg(any(
                all(ui_backend = "WEBUI", feature = "webui"),
                all(ui_backend = "QWEB", feature = "qweb")
            ))]
            Command::Default { run_in_background } => {
                config.run_in_background = *run_in_background;
            }
            _ => {}
        });

        Ok(config)
    }
}
