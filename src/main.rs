use std::path::PathBuf;

use musicbrainz_rs::{
    entity::{artist::Artist, recording::Recording, release::Release, work::Work},
    Browse, Fetch, Search,
};

use anyhow::Result;

// TODO:
// create a nix style symlinked artist/songs, album/songs, artist/albums, etc
// but store all songs in a single directory

pub mod musimanager {
    use std::collections::HashMap;

    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Tracker<S = Song> {
        pub artists: Vec<Artist<S>>,
        pub auto_search_artists: Vec<Artist<S>>,
        pub playlists: Vec<SongProvider<S>>,
        pub queues: Vec<SongProvider<S>>,
    }

    impl<S> Default for Tracker<S> {
        fn default() -> Self {
            Tracker {
                artists: Default::default(),
                auto_search_artists: Default::default(),
                playlists: Default::default(),
                queues: Default::default(),
            }
        }
    }

    impl Tracker<Song> {
        pub fn disambiguate(&self) -> EntityTracker {
            let mut et = EntityTracker::default();

            fn take_from(so: &mut Song, s: &Song) {
                so.artist_name = so
                    .artist_name
                    .as_ref()
                    .or(s.artist_name.as_ref())
                    .map(|s| s.to_owned());
                so.last_known_path = so
                    .last_known_path
                    .as_ref()
                    .or(s.last_known_path.as_ref())
                    .map(|s| s.to_owned());

                let mut new_titles = Vec::new();
                'first: for t in s.info.titles.iter() {
                    for t2 in so.info.titles.iter() {
                        if t == t2 || t.is_empty() {
                            continue 'first;
                        }
                    }
                    new_titles.push(t.clone());
                }
                so.info.titles.extend(new_titles);

                so.info.duration = so.info.duration.or(s.info.duration);

                let mut new_tags = Vec::new();
                'first: for t in s.info.tags.iter() {
                    for t2 in so.info.tags.iter() {
                        if t == t2 || t.is_empty() {
                            continue 'first;
                        }
                    }
                    new_tags.push(t.clone());
                }
                so.info.tags.extend(new_tags);

                if so.info.thumbnail_url.is_empty() {
                    so.info.thumbnail_url = s.info.thumbnail_url.clone();
                }
                if so.info.video_id.is_empty() {
                    so.info.video_id = s.info.video_id.clone();
                }
                if so.info.channel_id.is_empty() {
                    so.info.channel_id = s.info.channel_id.clone();
                }
                so.info.uploader_id = so
                    .info
                    .uploader_id
                    .as_ref()
                    .or(s.info.uploader_id.as_ref())
                    .map(|s| s.to_owned());
                so.info.album = so
                    .info
                    .album
                    .as_ref()
                    .or(s.info.album.as_ref())
                    .map(|s| s.to_owned());

                let mut new_artist_names = Vec::new();
                'first: for n in s.info.artist_names.iter() {
                    for n2 in so.info.artist_names.iter() {
                        if n == n2 || n.is_empty() {
                            continue 'first;
                        }
                    }
                    new_artist_names.push(n.clone());
                }
                so.info.artist_names.extend(new_artist_names);
            }

            let Tracker {
                artists,
                auto_search_artists,
                playlists,
                queues,
            } = self;
            let mut songs = HashMap::<String, Song>::new();
            for a in artists {
                for s in &a.songs {
                    if let Some(so) = songs.get_mut(&s.key) {
                        take_from(so, s);
                    } else {
                        songs.insert(s.key.clone(), s.clone());
                    }
                }
                for al in a.known_albums.iter() {
                    for s in al.songs.iter() {
                        if let Some(so) = songs.get_mut(&s.key) {
                            take_from(so, s);
                        } else {
                            songs.insert(s.key.clone(), s.clone());
                        }
                    }
                }
            }
            for a in auto_search_artists {
                for s in &a.songs {
                    if let Some(so) = songs.get_mut(&s.key) {
                        take_from(so, s);
                    } else {
                        songs.insert(s.key.clone(), s.clone());
                    }
                }
                for al in a.known_albums.iter() {
                    for s in al.songs.iter() {
                        if let Some(so) = songs.get_mut(&s.key) {
                            take_from(so, s);
                        } else {
                            songs.insert(s.key.clone(), s.clone());
                        }
                    }
                }
            }
            for p in playlists {
                for s in &p.data_list {
                    if let Some(so) = songs.get_mut(&s.key) {
                        take_from(so, s);
                    } else {
                        songs.insert(s.key.clone(), s.clone());
                    }
                }
            }
            for q in queues {
                for s in &q.data_list {
                    if let Some(so) = songs.get_mut(&s.key) {
                        take_from(so, s);
                    } else {
                        songs.insert(s.key.clone(), s.clone());
                    }
                }
            }
            for (_, s) in songs.iter_mut() {
                s.info.titles = s
                    .info
                    .titles
                    .iter()
                    .filter(|t| !t.is_empty())
                    .cloned()
                    .collect();
                s.info.artist_names = s
                    .info
                    .artist_names
                    .iter()
                    .filter(|t| !t.is_empty())
                    .cloned()
                    .collect();
                s.info.album = s.info.album.as_ref().filter(|a| !a.is_empty()).cloned();
                s.info.uploader_id = s
                    .info
                    .uploader_id
                    .as_ref()
                    .filter(|a| !a.is_empty())
                    .cloned();
            }

            for (_, s) in songs.into_iter() {
                et.songs.push(Song {
                    title: s.title,
                    key: s.key,
                    artist_name: s.artist_name,
                    info: Some(s.info).filter(|i| !i.video_id.is_empty()),
                    last_known_path: s.last_known_path,
                });
            }

            et
        }
    }

    #[derive(Serialize, Deserialize, Clone, Debug, Default)]
    pub struct EntityTracker {
        pub songs: Vec<Song<Option<SongInfo>>>,
        pub tracker: Tracker<SongId>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct SongId(pub String);

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct SongProvider<S> {
        pub name: String,
        pub data_list: Vec<S>,
        pub current_index: u32,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Album<S> {
        pub name: String,
        pub browse_id: String,
        pub playlist_id: Option<String>,
        pub songs: Vec<S>,
        pub artist_name: String,
        pub artist_keys: Vec<String>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Artist<S> {
        pub name: String,
        pub keys: Vec<String>,
        pub check_stat: bool,      // # TODO: not needed?
        pub ignore_no_songs: bool, // # wont be removed from db even if no songs in it (only tracking for new albums)
        pub name_confirmation_status: bool,
        pub songs: Vec<S>,
        pub known_albums: Vec<Album<S>>, // # to track what albums the user has listened to
        pub keywords: Vec<String>,       // # keywords for sort
        pub non_keywords: Vec<String>,   // # keywords/keys to specifically ignore
        pub search_keywords: Vec<String>,
        pub last_auto_search: Option<u32>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Song<I = SongInfo> {
        pub title: String, // NOTE: technically optional from python
        pub key: String,   // NOTE: technically optional from python
        pub artist_name: Option<String>,
        pub info: I,
        pub last_known_path: Option<String>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct SongInfo {
        pub titles: Vec<String>,
        pub video_id: String,
        pub duration: Option<f32>, // # TODO: no need?
        pub tags: Vec<String>,
        pub thumbnail_url: String,
        pub album: Option<String>,
        pub artist_names: Vec<String>,
        pub channel_id: String,
        pub uploader_id: Option<String>,
    }
}

mod covau_types {
    use std::path::PathBuf;

    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub enum Source {
        File(PathBuf),
        YtId(String),
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Song {
        pub title: String,
        pub mbz_id: Option<String>,
        pub sources: Vec<Source>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Artist {
        pub name: String,
        pub albums: Vec<AlbumId>,
    }
}

async fn parse_test() -> Result<()> {
    let path = "/home/issac/0Git/musimanager/db/musitracker.json";

    let data = std::fs::read_to_string(path)?;

    let parsed = serde_json::from_str::<musimanager::Tracker>(&data)?;

    // for a in parsed.artists.iter() {
    //     for s in a
    //         .songs
    //         .iter()
    //         .chain(parsed.playlists.iter().flat_map(|e| e.data_list.iter()))
    //     {}
    // }

    dbg!(parsed.disambiguate());

    Ok(())
}

async fn api_test() -> Result<()> {
    // let r = Artist::search("query=red velvet".into()).with_releases().execute().await;
    let r = Recording::search("method=indexed&query=carole and tuesday".into())
        .execute()
        .await?;
    for e in r.entities {
        dbg!(e.title);
    }
    // let r = Work::search("method=indexed&query=dildaara".into()).execute().await;
    // let r = Release::search("query=visions".into()).execute().await;
    // let r = Release::browse().execute().await;

    // dbg!(r);

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    init_logger("./")?;

    parse_test().await?;
    // api_test().await?;

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
