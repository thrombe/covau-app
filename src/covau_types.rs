use std::collections::HashSet;

use futures::stream::FuturesUnordered;
use sea_orm::TransactionTrait;
use serde::{Deserialize, Serialize};
use tokio_stream::StreamExt;

use crate::{
    db::{Db, DbAble, DbId},
    mbz,
    server::server::{FeRequest, FrontendClient, MessageResult},
    yt,
    yt::song_tube::TMusicListItem,
};

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct LocalState {
    queue: Queue,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
#[serde(tag = "type", content = "content")]
pub enum PlaySource {
    File(String),
    YtId(String),
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
#[serde(tag = "type", content = "content")]
pub enum InfoSource {
    YtId(String),
    MbzId(String),
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Playlist {
    pub title: String,
    pub songs: Vec<DbId>,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Queue(pub ListenQueue<Playlist>);

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Song {
    pub title: String,
    pub artists: Vec<String>,
    pub thumbnails: Vec<String>,
    pub info_sources: Vec<InfoSource>,
    pub play_sources: Vec<PlaySource>,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct UpdateItem<T> {
    pub done: bool,
    pub points: i32,
    #[serde(with = "serde_with_string")]
    pub added_ts: u64,
    pub item: T,
}
impl<T> UpdateItem<T> {
    pub fn new(item: T, ts: u64) -> Self {
        Self {
            done: false,
            points: 0,
            added_ts: ts,
            item,
        }
    }

    pub fn bump_up(&mut self) {
        self.points += 1;
    }
    pub fn bump_down(&mut self) {
        self.points -= 1;
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct ListenQueue<T> {
    pub queue: T,
    pub current_index: Option<u32>,
}

// this only contains minimal info. just to uniquely identify things
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
    MusimanagerSearch {
        // search words -> albums -> filter match any key -> songs
        search_words: Vec<String>,
        artist_keys: Vec<String>,
        non_search_words: Vec<String>,
        known_albums: Vec<UpdateItem<yt::AlbumId>>,
        songs: ListenQueue<Vec<UpdateItem<yt::VideoId>>>,
    },
    SongTubeSearch {
        search_words: Vec<String>,
        artist_keys: Vec<String>,
        known_albums: Vec<UpdateItem<yt::AlbumId>>,
        songs: ListenQueue<Vec<UpdateItem<yt::VideoId>>>,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Updater {
    pub title: String,
    pub source: UpdateSource,
    #[serde(with = "serde_with_string")]
    pub last_update_ts: u64,
    pub enabled: bool,
}

// https://github.com/serde-rs/json/issues/329#issuecomment-305608405
mod serde_with_string {
    use std::fmt::Display;
    use std::str::FromStr;

    use serde::{de, Deserialize, Deserializer, Serializer};

    pub fn serialize<T, S>(value: &T, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Display,
        S: Serializer,
    {
        serializer.collect_str(value)
    }

    pub fn deserialize<'de, T, D>(deserializer: D) -> Result<T, D::Error>
    where
        T: FromStr,
        T::Err: Display,
        D: Deserializer<'de>,
    {
        String::deserialize(deserializer)?
            .parse()
            .map_err(de::Error::custom)
    }
}

pub struct UpdateManager {
    st_fac: yt::SongTubeFac,
    fe: FrontendClient<FeRequest>,
    db: crate::db::Db,
}
impl UpdateManager {
    pub fn new(st_fac: yt::SongTubeFac, fe: FrontendClient<FeRequest>, db: crate::db::Db) -> Self {
        Self { st_fac, db, fe }
    }

    async fn notify_error(&self, message: String) -> anyhow::Result<()> {
        self.fe
            .send(MessageResult::Ok(FeRequest::NotifyError(message)))
            .await?;
        Ok(())
    }

    async fn notify(&self, message: String) -> anyhow::Result<()> {
        self.fe
            .send(MessageResult::Ok(FeRequest::Notify(message)))
            .await?;
        Ok(())
    }

    async fn get_next_updater(&self) -> anyhow::Result<Option<crate::db::DbItem<Updater>>> {
        let mut it = self.db.stream_models::<Updater>().await?;
        let ts = Db::timestamp();
        let week = 2 * 7 * 24 * 60 * 60;
        let check_delta = week * 2;

        let mut item: Option<crate::db::DbItem<Updater>> = None;
        let max_delta = 0;
        while let Some(m) = it.next().await {
            let m = m?;
            let t: Updater = m.parsed_assume();
            if !t.enabled {
                continue;
            }
            let delta = ts - t.last_update_ts;
            if delta < check_delta {
                continue;
            }

            if delta <= max_delta {
                continue;
            }

            item = Some(crate::db::DbItem {
                metadata: m.parse_assume_metadata(),
                t,
                id: m.id,
                typ: m.typ,
            });
        }

        Ok(item)
    }

    pub async fn update_one(&self) -> anyhow::Result<()> {
        let Some(mut updater) = self.get_next_updater().await? else {
            return Ok(());
        };

        match &mut updater.t.source {
            UpdateSource::Mbz {..} => todo!(),
            UpdateSource::MusimanagerSearch { .. } => {}
            UpdateSource::SongTubeSearch {
                search_words,
                artist_keys,
                known_albums,
                songs,
            } => {
                let keys: HashSet<String> = artist_keys.iter().map(String::from).collect();
                let mut known: HashSet<String> =
                    known_albums.iter().map(|a| a.item.0.to_string()).collect();
                let mut new_albums = vec![];
                for query in search_words {
                    let albums = self
                        .st_fac
                        .with_search_query::<yt::song_tube::Album>(query.as_str())
                        .await?;
                    let albums = albums.next_page().await?;

                    let albums = albums
                        .items
                        .into_iter()
                        .filter(|a| !known.contains(&a.id))
                        .filter(|a| {
                            a.author
                                .as_ref()
                                .map(|a| a.channel_id.as_ref().map(|id| keys.contains(id)))
                                .flatten()
                                .unwrap_or(false)
                        })
                        .collect::<Vec<_>>();

                    let mut album_futures = albums
                        .into_iter()
                        .inspect(|a| {
                            known.insert(a.id.clone());
                        })
                        .map(|a| async {
                            let songs = self
                                .st_fac
                                .with_query(yt::song_tube::BrowseQuery::Album(yt::AlbumId(
                                    a.id.clone(),
                                )))
                                .await?;
                            let songs = songs.next_page().await?;
                            let songs = songs
                                .items
                                .into_iter()
                                .map(|s| yt::song_tube::Song::assume(s))
                                .collect::<Vec<_>>();
                            Result::<_, anyhow::Error>::Ok(yt::song_tube::WithLinked {
                                item: a,
                                linked: songs,
                            })
                        })
                        .collect::<FuturesUnordered<_>>();

                    while let Some(album) = album_futures.next().await {
                        match album {
                            Ok(a) => {
                                new_albums.push(a);
                            }
                            Err(e) => {
                                self.notify_error(format!("{}", e)).await?;
                            }
                        }
                    }
                }

                let ts = Db::timestamp();
                updater.t.last_update_ts = ts;
                let txn = self.db.db.begin().await?;

                for a in new_albums.into_iter() {
                    let id = yt::AlbumId(a.item.id.clone());
                    let item = UpdateItem::new(id, ts);
                    known_albums.push(item);
                    for mut song in a.linked.into_iter() {
                        songs
                            .queue
                            .push(UpdateItem::new(yt::VideoId(song.id.clone()), ts));

                        song.album = Some(yt::song_tube::SmolAlbum {
                            name: a.item.title.clone(),
                            id: a.item.id.clone(),
                        });
                        song.authors.extend(a.item.author.iter().cloned());

                        let old = song.get_by_refid(&txn).await?;
                        match old {
                            Some(_) => {
                                // this Song item has very less info anyway. don't update old info
                            }
                            None => match song.insert(&txn).await {
                                Ok(_) => (),
                                Err(e) => {
                                    txn.rollback().await?;
                                    eprintln!(
                                        "failed to insert song in updater {}",
                                        &song.title.as_deref().unwrap_or("")
                                    );
                                    return Err(e);
                                }
                            },
                        }
                    }
                }
                match updater.update(&txn).await {
                    Ok(_) => (),
                    Err(e) => {
                        txn.rollback().await?;
                        return Err(e);
                    }
                }
                txn.commit().await?;
            }
        }
        self.notify(format!("updated updater: {}", &updater.t.title))
            .await?;

        Ok(())
    }

    pub async fn start(&self) -> anyhow::Result<()> {
        let dur = tokio::time::Duration::from_secs(10 * 60);
        loop {
            tokio::time::sleep(dur).await;
            self.update_one().await?;
        }
    }
}

pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
    let mut types = String::new();
    types +=
        "import type { ReleaseGroupWithInfo, ReleaseWithInfo, Recording } from '$types/mbz.ts';\n";
    types += "import type { VideoId, AlbumId } from '$types/yt.ts';\n";
    types += "\n";
    types += &specta::ts::export::<LocalState>(config)?;
    types += ";\n";
    types += &specta::ts::export::<PlaySource>(config)?;
    types += ";\n";
    types += &specta::ts::export::<InfoSource>(config)?;
    types += ";\n";
    types += &specta::ts::export::<Song>(config)?;
    types += ";\n";
    types += &specta::ts::export::<Playlist>(config)?;
    types += ";\n";
    types += &specta::ts::export::<Queue>(config)?;
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
