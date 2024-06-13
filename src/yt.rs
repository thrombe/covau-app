use std::{collections::HashSet, sync::Arc};

use serde::{Deserialize, Serialize};

use crate::server::{FrontendClient, MessageResult};

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct VideoId(String);

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct AlbumId(String);

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct PlaylistId(String);

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct ChannelId(String);

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct ArtistId(ChannelId);

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct ChannelOrUploaderId(String);

pub mod song_tube {
    use super::*;

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub enum Typ {
        Song,
        Video,
        Album,
        Playlist,
        Artist,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    #[serde(tag = "type", content = "content")]
    pub enum BrowseQuery {
        Search { search: Typ, query: String },
        Artist(ArtistId),
        Album(AlbumId),
        Playlist(PlaylistId),
        UpNext(VideoId),
        SongIds { ids: Vec<VideoId>, batch_size: u32 },
        HomeFeed,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    #[serde(tag = "type", content = "content")]
    pub enum MusicListItem {
        Song(Song),
        Video(Video),
        Album(Album),
        Playlist(Playlist),
        Artist(Artist),
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Thumbnail {
        pub url: String,
        pub width: u32,
        pub height: u32,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Author {
        pub name: String,
        pub channel_id: Option<String>,
    }
    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct SmolAlbum {
        pub name: String,
        pub id: String,
    }
    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Song {
        pub id: String,
        pub title: Option<String>,
        pub thumbnails: Vec<Thumbnail>,
        pub authors: Vec<Author>,
        pub album: Option<SmolAlbum>,
    }
    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Video {
        pub id: String,
        pub title: Option<String>,
        pub thumbnails: Vec<Thumbnail>,
        pub authors: Vec<Author>,
    }
    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Album {
        pub id: String,
        pub title: Option<String>,
        pub thumbnails: Vec<Thumbnail>,
        pub author: Option<Author>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Playlist {
        pub id: String,
        pub title: Option<String>,
        pub thumbnails: Vec<Thumbnail>,
        pub author: Option<Author>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Artist {
        pub id: String,
        pub name: Option<String>,
        pub subscribers: Option<String>,
        pub thumbnails: Vec<Thumbnail>,
    }

    pub trait TMusicListItem {
        fn typ() -> Typ;
        fn assume(item: MusicListItem) -> Self;
    }
    impl TMusicListItem for Song {
        fn typ() -> Typ {
            Typ::Song
        }
        fn assume(item: MusicListItem) -> Self {
            if let MusicListItem::Song(s) = item {
                s
            } else {
                unreachable!()
            }
        }
    }
    impl TMusicListItem for Video {
        fn typ() -> Typ {
            Typ::Video
        }
        fn assume(item: MusicListItem) -> Self {
            if let MusicListItem::Video(s) = item {
                s
            } else {
                unreachable!()
            }
        }
    }
    impl TMusicListItem for Album {
        fn typ() -> Typ {
            Typ::Album
        }
        fn assume(item: MusicListItem) -> Self {
            if let MusicListItem::Album(s) = item {
                s
            } else {
                unreachable!()
            }
        }
    }
    impl TMusicListItem for Artist {
        fn typ() -> Typ {
            Typ::Artist
        }
        fn assume(item: MusicListItem) -> Self {
            if let MusicListItem::Artist(s) = item {
                s
            } else {
                unreachable!()
            }
        }
    }
    impl TMusicListItem for Playlist {
        fn typ() -> Typ {
            Typ::Playlist
        }
        fn assume(item: MusicListItem) -> Self {
            if let MusicListItem::Playlist(s) = item {
                s
            } else {
                unreachable!()
            }
        }
    }
}

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
    pub id: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct AlbumWithInfo {
    #[serde(flatten)]
    pub album: Album,
    pub songs: Vec<Video>,
    pub artist_name: String,
    pub artist_keys: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
#[serde(tag = "type", content = "content")]
pub enum YtiRequest {
    CreateSongTube {
        id: String,
        query: song_tube::BrowseQuery,
    },
    DestroySongTube {
        id: String,
    },
    NextPageSongTube {
        id: String,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct AlbumsFetchResult {
    albums: Vec<AlbumWithInfo>,
    songs: Vec<VideoWithInfo>,
}

#[derive(Clone)]
pub struct SongTube<T> {
    pub inner: InnerSongTube,
    typ: std::marker::PhantomData<T>,
}
impl<T: song_tube::TMusicListItem> SongTube<T> {
    pub async fn next_page(&self) -> anyhow::Result<SearchResults<T>> {
        let items = self.inner.next_page().await?;
        let items = SearchResults {
            has_next_page: items.has_next_page,
            items: items.items.into_iter().map(T::assume).collect(),
        };
        Ok(items)
    }
}

#[derive(Clone)]
pub struct InnerSongTube {
    client: FrontendClient<YtiRequest>,
    id: String,
    alive: Arc<std::sync::atomic::AtomicBool>,
}

impl Drop for InnerSongTube {
    fn drop(&mut self) {
        if self.alive.swap(false, std::sync::atomic::Ordering::Relaxed) {
            let id = self.id.clone();
            let client = self.client.clone();
            tokio::task::spawn(async move {
                match client.execute(YtiRequest::DestroySongTube { id }).await {
                    Ok(()) => (),
                    Err(e) => {
                        eprintln!("Error while destroying InnerSongTube {}", e);
                    }
                }
            });
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct SearchResults<T> {
    pub has_next_page: bool,
    pub items: Vec<T>,
}

impl InnerSongTube {
    pub async fn next_page(&self) -> anyhow::Result<SearchResults<song_tube::MusicListItem>> {
        let items = self
            .client
            .execute(YtiRequest::NextPageSongTube {
                id: self.id.clone(),
            })
            .await?;
        Ok(items)
    }

    pub async fn destroy(&self) -> anyhow::Result<()> {
        let _: () = self
            .client
            .execute(YtiRequest::DestroySongTube {
                id: self.id.clone(),
            })
            .await?;
        self.alive
            .store(false, std::sync::atomic::Ordering::Relaxed);
        Ok(())
    }
}

#[derive(Clone)]
pub struct SongTubeFac(FrontendClient<YtiRequest>);

impl SongTubeFac {
    pub fn new(fe: FrontendClient<YtiRequest>) -> Self {
        Self(fe)
    }

    pub async fn with_search_query<T: song_tube::TMusicListItem>(
        &self,
        query: impl Into<String>,
    ) -> anyhow::Result<SongTube<T>> {
        let ist = self
            .with_query(song_tube::BrowseQuery::Search {
                search: T::typ(),
                query: query.into(),
            })
            .await?;
        Ok(SongTube {
            inner: ist,
            typ: Default::default(),
        })
    }

    pub async fn with_query(&self, query: song_tube::BrowseQuery) -> anyhow::Result<InnerSongTube> {
        let id = ulid::Ulid::new().to_string();
        let _: () = self
            .0
            .execute(YtiRequest::CreateSongTube {
                query,
                id: id.clone(),
            })
            .await?;

        Ok(InnerSongTube {
            client: self.0.clone(),
            id,
            alive: Arc::new(true.into()),
        })
    }
}

pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
    let mut types = String::new();
    types += &specta::ts::export::<song_tube::Typ>(config)?;
    types += ";\n";
    types += &specta::ts::export::<song_tube::MusicListItem>(config)?;
    types += ";\n";
    types += &specta::ts::export::<song_tube::BrowseQuery>(config)?;
    types += ";\n";
    types += &specta::ts::export::<song_tube::Thumbnail>(config)?;
    types += ";\n";
    types += &specta::ts::export::<song_tube::Album>(config)?;
    types += ";\n";
    types += &specta::ts::export::<song_tube::SmolAlbum>(config)?;
    types += ";\n";
    types += &specta::ts::export::<song_tube::Artist>(config)?;
    types += ";\n";
    types += &specta::ts::export::<song_tube::Author>(config)?;
    types += ";\n";
    types += &specta::ts::export::<song_tube::Playlist>(config)?;
    types += ";\n";
    types += &specta::ts::export::<song_tube::Song>(config)?;
    types += ";\n";
    types += &specta::ts::export::<song_tube::Video>(config)?;
    types += ";\n";

    // types += &specta::ts::export::<Video>(config)?;
    // types += ";\n";
    // types += &specta::ts::export::<VideoWithInfo>(config)?;
    // types += ";\n";
    // types += &specta::ts::export::<Album>(config)?;
    // types += ";\n";
    // types += &specta::ts::export::<AlbumWithInfo>(config)?;
    // types += ";\n";
    types += &specta::ts::export::<VideoId>(config)?;
    types += ";\n";
    types += &specta::ts::export::<AlbumId>(config)?;
    types += ";\n";
    types += &specta::ts::export::<ChannelId>(config)?;
    types += ";\n";
    types += &specta::ts::export::<ArtistId>(config)?;
    types += ";\n";
    types += &specta::ts::export::<PlaylistId>(config)?;
    types += ";\n";
    types += &specta::ts::export::<SearchResults<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<YtiRequest>(config)?;
    types += ";\n";

    Ok(types)
}
