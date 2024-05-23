use std::path::PathBuf;

use musicbrainz_rs::{
    entity::{artist::Artist, recording::Recording, release::Release, work::Work},
    Browse, Fetch, Search,
};

use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    init_logger("./")?;

    parse_test().await?;

    Ok(())
}

pub mod musimanager {
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Tracker {
        artists: Vec<Artist>,
        playlists: Vec<SongProvider>,
        queues: Vec<SongProvider>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct SongProvider {
        name: String,
        data_list: Vec<Song>,
        current_index: u32,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Album {
        name: String,
        browse_id: String,
        playlist_id: Option<String>,
        songs: Vec<Song>,
        artist_name: String,
        artist_keys: Vec<String>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Artist {
        name: String,
        keys: Vec<String>,
        check_stat: bool, // # TODO: not needed?
        ignore_no_songs: bool, // # wont be removed from db even if no songs in it (only tracking for new albums)
        name_confirmation_status: bool,
        songs: Vec<Song>,
        known_albums: Vec<Album>, // # to track what albums the user has listened to
        keywords: Vec<String>, // # keywords for sort
        non_keywords: Vec<String>, // # keywords/keys to specifically ignore
        search_keywords: Vec<String>,
        last_auto_search: Option<u32>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Song {
        title: Option<String>,
        key: Option<String>,
        artist_name: Option<String>,
        info: SongInfo,
        last_known_path: Option<String>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct SongInfo {
        titles: Vec<String>,
        video_id: String,
        duration: Option<f32>, // # TODO: no need?
        tags: Vec<String>,
        thumbnail_url: String,
        album: Option<String>,
        artist_names: Vec<String>,
        channel_id: String,
        uploader_id: Option<String>,
    }
}

async fn parse_test() -> Result<()> {
    let path = "/home/issac/0Git/musimanager/db/musitracker.json";

    let data = std::fs::read_to_string(path)?;

    let parsed = serde_json::from_str::<musimanager::Tracker>(&data)?;

    dbg!(&parsed);
    
    Ok(())
}

async fn api_test() -> Result<()> {
    // let r = Artist::search("query=red velvet".into()).with_releases().execute().await;
    // let r = Recording::search("query=dildaara".into()).execute().await;
    let r = Work::search("query=dildaara".into()).execute().await;
    // let r = Release::search("query=visions".into()).execute().await;
    // let r = Release::browse().execute().await;

    dbg!(r);

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
