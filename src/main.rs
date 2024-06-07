#![allow(dead_code)]

use std::path::PathBuf;

use anyhow::Result;

mod musiplayer;

// TODO:
// create a nix style symlinked artist/songs, album/songs, artist/albums, etc
// but store all songs in a single directory

pub mod db;
pub mod mbz;
pub mod musimanager;
pub mod server;

mod covau_types {
    use std::path::PathBuf;

    use serde::{Deserialize, Serialize};

    use super::{mbz, yt};

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    #[serde(tag = "type", content = "content")]
    pub enum PlaySource {
        File(PathBuf),
        YtId(String),
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    #[serde(tag = "type", content = "content")]
    pub enum InfoSource {
        YtId(String),
        MbzId(String),
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Song {
        pub title: String,
        pub mbz_id: Option<String>,
        pub sources: Vec<PlaySource>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct UpdateItem<T> {
        pub done: bool,
        pub points: u32,
        pub item: T,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct ListenQueue<T> {
        pub queue: T,
        pub current_index: u32,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    #[serde(tag = "type", content = "content")]
    pub enum UpdateSource {
        Mbz {
            // artist -> release groups -> releases -> recordings
            // artist -> releases -> recordings
            artist_id: String,
            release_groups: Vec<UpdateItem<mbz::ReleaseGroupWithInfo>>,
            releases: Vec<UpdateItem<mbz::ReleaseWithInfo>>,
            recordings: ListenQueue<Vec<UpdateItem<mbz::Recording>>>,
        },
        YtSearch {
            // search words -> albums -> filter match any key -> songs
            search_words: Vec<String>,
            artist_keys: Vec<String>,
            non_search_words: Vec<String>,
            known_albums: Vec<UpdateItem<yt::Album>>,
            songs: ListenQueue<Vec<UpdateItem<yt::Video>>>,
        },
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Updater {
        pub title: String,
        pub source: UpdateSource,
        pub last_update_ts: u32,
        pub enabled: bool,
    }

    pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
        let mut types = String::new();
        types += "import type { ReleaseGroupWithInfo, ReleaseWithInfo, Recording } from '$types/mbz.ts';\n";
        types += "import type { Album, Video } from '$types/yt.ts';\n";
        types += "\n";
        types += &specta::ts::export::<PlaySource>(config)?;
        types += ";\n";
        types += &specta::ts::export::<Song>(config)?;
        types += ";\n";
        types += &specta::ts::export::<UpdateItem<()>>(config)?;
        types += ";\n";
        types += &specta::ts::export::<ListenQueue<()>>(config)?;
        types += ";\n";
        types += &specta::ts::export::<UpdateSource>(config)?;
        types += ";\n";
        types += &specta::ts::export::<Updater>(config)?;
        types += ";\n";

        Ok(types)
    }
}

pub mod yt {
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Video {
        pub title: String,
        pub id: String,
        pub album: Option<Album>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct VideoWithInfo {
        #[serde(flatten)]
        pub song: Video,

        pub titles: Vec<String>, // track > alt_title > title
        pub thumbnail_url: String,
        pub album_name: Option<String>,
        pub artist_names: Vec<String>,
        pub channel_id: String,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Album {
        pub name: String,
        pub browse_id: String,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct AlbumWithInfo {
        #[serde(flatten)]
        pub album: Album,
        pub playlist_id: String,
        pub songs: Vec<Video>,
        pub artist_name: String,
        pub artist_keys: Vec<String>,
    }

    pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
        let mut types = String::new();
        types += &specta::ts::export::<Video>(config)?;
        types += ";\n";
        types += &specta::ts::export::<VideoWithInfo>(config)?;
        types += ";\n";
        types += &specta::ts::export::<Album>(config)?;
        types += ";\n";
        types += &specta::ts::export::<AlbumWithInfo>(config)?;
        types += ";\n";

        Ok(types)
    }
}

mod webui {
    use std::{ffi::CStr, sync::Arc};
    use webui_rs::webui::{self, bindgen::webui_malloc};

    // returned pointer is only freed if allocated using webui_malloc
    // https://github.com/webui-dev/webui/blob/a3f3174c73b2414ea27bebb0fd62ccc0f180ad30/src/webui.c#L3150C1-L3150C23
    unsafe extern "C" fn unsafe_handle(
        name: *const std::os::raw::c_char,
        length: *mut i32,
    ) -> *const std::os::raw::c_void {
        let name = CStr::from_ptr(name);
        let res = handle(name.to_string_lossy().as_ref());
        let res = res.into_boxed_str();
        *length = res.len() as _;
        let block = webui_malloc(res.len());
        std::ptr::copy_nonoverlapping(res.as_ptr(), block as _, res.len());
        block as _
    }

    fn handle(name: &str) -> String {
        dbg!(name);
        // let data = reqwest::blocking::get(String::from("http://localhost:5173") + name).unwrap().text().unwrap();
        let data = std::fs::read_to_string(String::from("./electron/dist") + name).unwrap();
        dbg!(&data);
        data
    }

    #[derive(Clone)]
    pub struct App {
        pub win: Arc<webui::Window>,
    }
    impl App {
        pub fn new() -> Self {
            Self {
                win: Arc::new(webui::Window::new()),
            }
        }

        pub async fn open_window(&self, url: String) -> anyhow::Result<()> {
            self.win.set_file_handler(unsafe_handle);
            unsafe {
                let _ = webui::bindgen::webui_set_port(self.win.id, 6174);
            }

            let s = self.clone();
            tokio::task::spawn_blocking(move || {
                s.win.show(url);

                let _ = s.win.run_js("console.log('webui.js loaded :}')");

                webui::wait();
            })
            .await?;

            Ok(())
        }

        pub fn close(&self) {
            self.win.close();
        }
    }
}

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
    let port = 5173;
    #[cfg(build_mode = "PRODUCTION")]
    let port = 6173;

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
    server::start("127.0.0.1".parse()?, 6173).await;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    init_logger("./")?;

    // dbg!(ulid::Ulid::new().to_string());

    // parse_test().await?;
    // db::db_test().await?;
    // mbz::api_test().await?;

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
