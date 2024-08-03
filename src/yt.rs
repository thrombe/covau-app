use std::sync::Arc;

use futures::StreamExt;
use serde::{Deserialize, Serialize};

use crate::server::routes::FrontendClient;

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct VideoId(pub String);

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct AlbumId(pub String);

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct PlaylistId(pub String);

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct ChannelId(pub String);

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct ArtistId(pub ChannelId);

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct ChannelOrUploaderId(pub String);

pub mod song_tube {
    use super::*;

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub enum Typ {
        YtSong,
        YtAlbum,
        YtPlaylist,
        YtArtist,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub enum ArtistTyp {
        Channel,
        Artist,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    #[serde(tag = "type", content = "content")]
    pub enum BrowseQuery {
        Search { search: Typ, query: String },
        VideoSearch { query: String },
        ChannelSearch { query: String },
        ArtistSongs(ArtistId),
        ArtistReleases(ArtistId),
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
        pub name: Option<String>,
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
    pub struct WithLinked<T, Id> {
        pub item: T,
        pub linked: Vec<Id>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Artist {
        pub id: String,
        pub typ: ArtistTyp,
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
            Typ::YtSong
        }
        fn assume(item: MusicListItem) -> Self {
            if let MusicListItem::Song(s) = item {
                s
            } else {
                unreachable!()
            }
        }
    }
    impl TMusicListItem for Album {
        fn typ() -> Typ {
            Typ::YtAlbum
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
            Typ::YtArtist
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
            Typ::YtPlaylist
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
    GetSongUri {
        id: String,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct SongUriInfo {
    song: song_tube::Song,
    uri: String,
    approx_duration_ms: u32,
    content_length: u32,
    mime_type: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct AlbumsFetchResult {
    albums: Vec<song_tube::WithLinked<song_tube::Album, VideoId>>,
    songs: Vec<song_tube::Song>,
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
pub struct SongTubeFac {
    pub fe: FrontendClient<YtiRequest>,
    pub client: reqwest::Client,
    pub config: Arc<crate::cli::DerivedConfig>,
}

impl SongTubeFac {
    pub fn new(
        fe: FrontendClient<YtiRequest>,
        client: reqwest::Client,
        config: Arc<crate::cli::DerivedConfig>,
    ) -> Self {
        Self { fe, client, config }
    }

    pub async fn get_song(&self, id: String) -> anyhow::Result<Vec<u8>> {
        let info: SongUriInfo = self
            .fe
            .execute(YtiRequest::GetSongUri { id: id.clone() })
            .await?;
        let bufsize = 500_000; // 500k

        let fullchunks = info.content_length / bufsize;
        let chunkpoints = (0..fullchunks)
            .map(|i| i * bufsize)
            .chain(std::iter::once(info.content_length));

        let bytes: futures::stream::FuturesOrdered<_> = chunkpoints
            .clone()
            .zip(chunkpoints.clone().skip(1))
            .filter(|(s, e)| *e > *s)
            .map(|(start, end)| format!("bytes={}-{}", start, end - 1))
            .map(|r| (r, info.uri.clone(), self.client.clone()))
            .map(|(range, uri, client)| async move {
                let req = client
                    .get(uri)
                    .header("User-Agent", "Mozilla/5.0")
                    .header("accept-language", "en-US,en")
                    .header("Range", range);

                let req = req.build()?;
                let res = client.execute(req).await?;
                let bytes = res.bytes().await?;
                Ok::<_, anyhow::Error>(bytes)
            })
            .collect();
        let bytes = bytes
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<anyhow::Result<Vec<_>>>()?
            .into_iter()
            .fold(Vec::new(), |mut vec, bytes| {
                vec.extend(bytes.into_iter());
                vec
            });

        Ok(bytes)
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
            .fe
            .execute(YtiRequest::CreateSongTube {
                query,
                id: id.clone(),
            })
            .await?;

        Ok(InnerSongTube {
            client: self.fe.clone(),
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
    types += &specta::ts::export::<song_tube::ArtistTyp>(config)?;
    types += ";\n";
    types += &specta::ts::export::<song_tube::Artist>(config)?;
    types += ";\n";
    types += &specta::ts::export::<song_tube::Author>(config)?;
    types += ";\n";
    types += &specta::ts::export::<song_tube::Playlist>(config)?;
    types += ";\n";
    types += &specta::ts::export::<song_tube::Song>(config)?;
    types += ";\n";

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
    types += &specta::ts::export::<SongUriInfo>(config)?;
    types += ";\n";

    Ok(types)
}
