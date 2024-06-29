use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

pub use crate::yt::{ VideoId, AlbumId };

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Tracker<S = Song, A = Album<Song>> {
    pub artists: Vec<Artist<S, A>>,
    pub auto_search_artists: Vec<Artist<S, A>>,
    pub playlists: Vec<SongProvider<S>>,
    pub queues: Vec<SongProvider<S>>,
}

impl<S, A> Default for Tracker<S, A> {
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
    pub fn clean(&self) -> EntityTracker {
        let mut et = EntityTracker::default();

        fn unique(a: &[String], b: &[String]) -> Vec<String> {
            let mut s = HashSet::<&str>::from_iter(b.iter().map(|s| s.as_str()));
            s.extend(a.iter().map(|s| s.as_str()));

            s.into_iter().map(ToString::to_string).collect()
        }

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

            so.info.titles = unique(&so.info.titles, &s.info.titles);

            so.info.duration = so.info.duration.or(s.info.duration);

            so.info.tags = unique(&so.info.tags, &s.info.tags);

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

            so.info.artist_names = unique(&so.info.artist_names, &s.info.artist_names);
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
                if s.title.contains("---") {
                    let key = "--------------";
                    songs.insert(
                        key.to_owned(),
                        Song {
                            title: s.title.clone(),
                            key: key.to_owned(),
                            artist_name: None,
                            info: Default::default(),
                            last_known_path: None,
                        },
                    );
                } else if s.title.contains("___") {
                    let key = "______________";
                    songs.insert(
                        key.to_owned(),
                        Song {
                            title: s.title.clone(),
                            key: key.to_owned(),
                            artist_name: None,
                            info: Default::default(),
                            last_known_path: None,
                        },
                    );
                } else if s.title.contains("===") {
                    let key = "==============";
                    songs.insert(
                        key.to_owned(),
                        Song {
                            title: s.title.clone(),
                            key: key.to_owned(),
                            artist_name: None,
                            info: Default::default(),
                            last_known_path: None,
                        },
                    );
                } else {
                    #[allow(clippy::collapsible_else_if)]
                    if let Some(so) = songs.get_mut(&s.key) {
                        take_from(so, s);
                    } else {
                        songs.insert(s.key.clone(), s.clone());
                    }
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
            s.info.titles.retain(|t| !t.is_empty());
            s.info.artist_names.retain(|t| !t.is_empty());
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

        let mut m_albums = HashMap::new();
        for a in artists.iter() {
            for al in a.known_albums.iter() {
                m_albums.insert(al.browse_id.clone(), al.clone());
            }
        }
        for a in auto_search_artists.iter() {
            for al in a.known_albums.iter() {
                if let Some(alo) = m_albums.get_mut(&al.browse_id) {
                    alo.playlist_id = alo
                        .playlist_id
                        .as_ref()
                        .or(al.playlist_id.as_ref())
                        .cloned();

                    let mut songs = HashMap::new();
                    for s in alo.songs.iter() {
                        songs.insert(s.key.clone(), s.clone());
                    }
                    for s in al.songs.iter() {
                        if !songs.contains_key(&s.key) {
                            songs.insert(s.key.clone(), s.clone());
                        }
                    }
                    alo.songs = songs.into_values().collect();

                    alo.artist_keys = unique(&alo.artist_keys, &al.artist_keys);

                    if alo.artist_name.is_empty() {
                        alo.artist_name = al.artist_name.clone();
                    }
                    if alo.name.is_empty() {
                        alo.name = al.name.clone();
                    }
                } else {
                    m_albums.insert(al.browse_id.clone(), al.clone());
                }
            }
        }
        et.albums = m_albums
            .into_values()
            .map(|al| Album {
                name: al.name,
                browse_id: al.browse_id,
                playlist_id: al.playlist_id,
                songs: al.songs.into_iter().map(|s| VideoId(s.key)).collect(),
                artist_name: al.artist_name,
                artist_keys: al.artist_keys,
            })
            .collect();

        let mut m_artists = HashMap::new();
        for a in artists.iter() {
            m_artists.insert(a.name.clone(), a.clone());
        }
        for a in auto_search_artists {
            if let Some(ao) = m_artists.get_mut(&a.name) {
                ao.keys = unique(&ao.keys, &a.keys);
                ao.search_keywords = unique(&ao.search_keywords, &a.search_keywords);
                ao.non_keywords = unique(&ao.non_keywords, &a.non_keywords);
                ao.keywords = unique(&ao.keywords, &a.keywords);

                let mut albums = HashMap::new();
                for al in ao.known_albums.iter() {
                    albums.insert(al.browse_id.clone(), al.clone());
                }
                for al in a.known_albums.iter() {
                    if !albums.contains_key(&al.browse_id) {
                        albums.insert(al.browse_id.clone(), al.clone());
                    }
                }
                ao.known_albums = albums.into_values().collect();

                ao.unexplored_songs = a.songs.clone();
                ao.unexplored_songs.iter_mut().for_each(|s| {
                    if s.title.contains("---") {
                        let key = "--------------";
                        *s = Song {
                            title: key.to_owned(),
                            key: key.to_owned(),
                            artist_name: None,
                            info: Default::default(),
                            last_known_path: None,
                        };
                    } else if s.title.contains("___") {
                        let key = "______________";
                        *s = Song {
                            title: key.to_owned(),
                            key: key.to_owned(),
                            artist_name: None,
                            info: Default::default(),
                            last_known_path: None,
                        };
                    } else if s.title.contains("===") {
                        let key = "==============";
                        *s = Song {
                            title: key.to_owned(),
                            key: key.to_owned(),
                            artist_name: None,
                            info: Default::default(),
                            last_known_path: None,
                        };
                    }
                });
            } else {
                let mut a = a.clone();
                a.unexplored_songs = a.songs;
                a.songs = Vec::new();

                m_artists.insert(a.name.clone(), a.clone());
            }
        }
        et.artists = m_artists
            .into_values()
            .map(|a| Artist {
                name: a.name,
                keys: a.keys,
                check_stat: a.check_stat,
                ignore_no_songs: a.ignore_no_songs,
                name_confirmation_status: a.name_confirmation_status,
                songs: a.songs.into_iter().map(|s| VideoId(s.key)).collect(),
                unexplored_songs: a
                    .unexplored_songs
                    .into_iter()
                    .map(|s| VideoId(s.key))
                    .collect(),
                known_albums: a
                    .known_albums
                    .into_iter()
                    .map(|al| AlbumId(al.browse_id))
                    .collect(),
                keywords: a.keywords,
                non_keywords: a.non_keywords,
                search_keywords: a.search_keywords,
                last_auto_search: a.last_auto_search,
            })
            .collect();

        for pl in playlists.iter() {
            et.playlists.push(Playlist(SongProvider {
                name: pl.name.to_string(),
                data_list: pl
                    .data_list
                    .iter()
                    .map(|s| VideoId(s.key.to_string()))
                    .collect(),
                current_index: pl.current_index,
            }));
        }

        for q in queues.iter() {
            et.queues.push(Queue(SongProvider {
                name: q.name.to_string(),
                data_list: q
                    .data_list
                    .iter()
                    .map(|s| VideoId(s.key.to_string()))
                    .collect(),
                current_index: q.current_index,
            }));
        }

        et
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, specta::Type)]
pub struct EntityTracker {
    pub songs: Vec<Song<Option<SongInfo>>>,
    pub albums: Vec<Album<VideoId>>,

    pub artists: Vec<Artist<VideoId, AlbumId>>,
    pub playlists: Vec<Playlist<VideoId>>,
    pub queues: Vec<Queue<VideoId>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Playlist<S>(pub SongProvider<S>);

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Queue<S>(pub SongProvider<S>);

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct SongProvider<S> {
    pub name: String,
    pub data_list: Vec<S>,
    pub current_index: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Album<S> {
    pub name: String,
    pub browse_id: String,
    pub playlist_id: Option<String>,
    pub songs: Vec<S>,
    pub artist_name: String,
    pub artist_keys: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Artist<S, A> {
    pub name: String,
    pub keys: Vec<String>,
    pub check_stat: bool,      // # TODO: not needed?
    pub ignore_no_songs: bool, // # wont be removed from db even if no songs in it (only tracking for new albums)
    pub name_confirmation_status: bool,
    pub songs: Vec<S>,
    pub known_albums: Vec<A>, // # to track what albums the user has listened to
    pub keywords: Vec<String>, // # keywords for sort
    pub non_keywords: Vec<String>, // # keywords/keys to specifically ignore
    pub search_keywords: Vec<String>,
    pub last_auto_search: Option<u32>,

    // not in python implementation
    #[serde(default = "Vec::new")]
    pub unexplored_songs: Vec<S>,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Song<I = SongInfo> {
    pub title: String, // NOTE: technically optional from python
    pub key: String,   // NOTE: technically optional from python
    pub artist_name: Option<String>,
    pub info: I,
    pub last_known_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, specta::Type)]
pub struct SongInfo {
    pub titles: Vec<String>, // track > alt_title > title
    pub video_id: String,
    pub duration: Option<f32>, // # TODO: no need?
    pub tags: Vec<String>,
    pub thumbnail_url: String,
    pub album: Option<String>,
    pub artist_names: Vec<String>, // artist > uploader > creator > channel
    pub channel_id: String,
    pub uploader_id: Option<String>,
}

pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
    let mut types = String::new();
    types += "import type { VideoId, AlbumId } from '$types/yt.ts';\n";
    types += "\n";
    types += &specta::ts::export::<SongInfo>(config)?;
    types += ";\n";
    types += &specta::ts::export::<Song>(config)?;
    types += ";\n";
    types += &specta::ts::export::<Artist<(), ()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<Album<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<SongProvider<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<EntityTracker>(config)?;
    types += ";\n";
    types += &specta::ts::export::<Tracker>(config)?;
    types += ";\n";
    types += &specta::ts::export::<Playlist<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<Queue<()>>(config)?;
    types += ";\n";

    Ok(types)
}

async fn parse_test() -> anyhow::Result<()> {
    let path = "/home/issac/0Git/musimanager/db/musitracker.json";

    let data = std::fs::read_to_string(path)?;

    let parsed = serde_json::from_str::<Tracker>(&data)?;

    // for a in parsed.artists.iter() {
    //     for s in a
    //         .songs
    //         .iter()
    //         .chain(parsed.playlists.iter().flat_map(|e| e.data_list.iter()))
    //     {}
    // }

    let dis = parsed.clean();
    dbg!(dis);
    // dbg!(parsed
    //     .artists
    //     .iter()
    //     .map(|a| a.known_albums.clone())
    //     .collect::<Vec<_>>());

    Ok(())
}
