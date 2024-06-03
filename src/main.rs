#![allow(dead_code)]

use std::path::PathBuf;

use anyhow::Result;

mod musiplayer;

// TODO:
// create a nix style symlinked artist/songs, album/songs, artist/albums, etc
// but store all songs in a single directory

pub mod musimanager;
pub mod server;
pub mod db;

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
        done: bool,
        points: u32,
        item: T,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct ListenQueue<T> {
        queue: T,
        current_index: u32,
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
        }
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

pub mod mbz {
    use musicbrainz_rs::{
        entity::{artist, recording, release, release_group, work::Work},
        Search,
    };
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Recording {
        pub title: String,
        pub id: String,
        pub releases: Vec<Release>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct ReleaseGroup {
        pub id: String,
        pub title: String,
        pub primary_type: String,
        pub secondary_types: Vec<String>,
        pub disambiguation: String,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct ReleaseGroupWithInfo {
        #[serde(flatten)]
        pub group: ReleaseGroup,
        pub releases: Vec<Release>,
        pub credit: Vec<Artist>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct ReleaseMedia {
      pub track_count: u32,
      pub format: Option<String>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Release {
        pub id: String,
        pub title: String,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct ReleaseWithInfo {
        #[serde(flatten)]
        pub release: Release,
        pub release_group: Option<ReleaseGroup>,
        pub media: Vec<ReleaseMedia>,
        pub credit: Vec<Artist>,
    }


    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct WithUrlRels<T> {
        pub item: T,
        pub urls: Vec<Url>,
    }
    
    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Artist {
        pub name: String,
        pub id: String,
        pub aliases: Vec<Alias>,
        pub disambiguation: String,
        #[serde(rename = "type")]
        pub typ: Option<String>,
        pub area: Option<Area>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Url {
        id: String,
        url: String,
        #[serde(rename = "type")]
        typ: String,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Area {
        pub name: String,
        pub id: String,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Alias {
        pub name: String,
        #[serde(rename = "type")]
        pub typ: String,
    }

    pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
        let mut types = String::new();
        types += &specta::ts::export::<Recording>(config)?;
        types += ";\n";
        types += &specta::ts::export::<ReleaseGroup>(config)?;
        types += ";\n";
        types += &specta::ts::export::<ReleaseGroupWithInfo>(config)?;
        types += ";\n";
        types += &specta::ts::export::<ReleaseMedia>(config)?;
        types += ";\n";
        types += &specta::ts::export::<Release>(config)?;
        types += ";\n";
        types += &specta::ts::export::<ReleaseWithInfo>(config)?;
        types += ";\n";
        types += &specta::ts::export::<Artist>(config)?;
        types += ";\n";
        types += &specta::ts::export::<Area>(config)?;
        types += ";\n";
        types += &specta::ts::export::<Alias>(config)?;
        types += ";\n";
        types += &specta::ts::export::<Url>(config)?;
        types += ";\n";

        Ok(types)
    }

    pub async fn api_test() -> anyhow::Result<()> {
        let r = artist::Artist::search("query=aimer&inc=url-rels".into()).execute().await?;
        // let r = recording::Recording::search("method=indexed&query=rejuvenation queen bee".into())
        //     .execute()
        //     .await?;
        // let r = Work::search("method=indexed&query=violence".into()).execute().await?;
        // let r = release::Release::search("query=visions".into()).execute().await?;
        // let r = release_group::ReleaseGroup::search("query=visions milet".into()).execute().await?;
        // let r = Release::browse().execute().await;

        println!("{}", serde_json::to_string_pretty(&r)?);

        Ok(())
    }
}

mod webui {
    use std::ffi::CStr;
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

    pub async fn test_webui(url: &str) -> anyhow::Result<webui::Window> {
        let win = webui::Window::new();
        win.set_file_handler(unsafe_handle);

        // win.show("<html><head><script src=\"webui.js\"></script><head></head><body><a href=\"/test.html\"> Hello World ! </a> </body></html>");
        win.show(url);

        let a = win.run_js("console.log('hello')").data;
        dbg!(a);
        let a = win.run_js("console.log('a', b)").data;
        dbg!(a);

        tokio::task::spawn_blocking(|| {
            webui::wait();
        })
        .await?;

        Ok(win)
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

#[tokio::main]
async fn main() -> Result<()> {
    init_logger("./")?;

    // dbg!(ulid::Ulid::new().to_string());

    // parse_test().await?;
    // api_test().await?;

    dump_types()?;

    server::test_server().await?;

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
