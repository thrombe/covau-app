use std::path::PathBuf;

use libcovau::clap::{self, arg, command, Parser, Subcommand};
use libcovau::{anyhow, dirs};
use serde::{Deserialize, Serialize};

use libcovau::config::Config;
pub use libcovau::config::FeCommand;

#[derive(Subcommand, Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub enum Command {
    FeCommand {
        #[command(subcommand)]
        command: FeCommand,
    },
    Server,
    #[cfg(feature = "tao-wry")]
    TaoWry {
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
            all(ui_backend = "TAO-WRY", feature = "tao-wry"),
            all(ui_backend = "QWEB", feature = "qweb-bin"),
            all(ui_backend = "QWEB", feature = "qweb-dylib"),
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
        #[cfg(build_mode = "PROD")]
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
            #[cfg(any(feature = "qweb-dylib", feature = "qweb-bin"))]
            Command::Qweb { run_in_background } => {
                config.run_in_background = *run_in_background;
            }
            Command::Server => {
                config.run_in_background = true;
            }
            #[cfg(any(
                all(ui_backend = "TAO-WRY", feature = "tao-wry"),
                all(ui_backend = "QWEB", feature = "qweb-bin"),
                all(ui_backend = "QWEB", feature = "qweb-dylib"),
            ))]
            Command::Default { run_in_background } => {
                config.run_in_background = *run_in_background;
            }
            _ => {}
        });

        Ok(config)
    }
}
