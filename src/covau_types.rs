use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::{mbz, yt};
use super::db::DbId;

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
    pub haystacks: Vec<String>,
    pub info_sources: Vec<InfoSource>,
    pub play_sources: Vec<PlaySource>,
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
        known_albums: Vec<UpdateItem<yt::Album>>,
        songs: ListenQueue<Vec<UpdateItem<yt::Video>>>,
    },
    SongTubeSearch {
        search_words: Vec<String>,
        artist_keys: Vec<String>,
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

pub struct UpdateManager {
    st_fac: yt::SongTubeFac,
    db: crate::db::Db,
}
impl UpdateManager {
    pub fn new(st_fac: yt::SongTubeFac, db: crate::db::Db) -> Self {
        Self { st_fac, db }
    }

    pub async fn test(&self) -> anyhow::Result<()> {
        let ist = self
            .st_fac
            .with_search_query::<yt::song_tube::Song>("Milet")
            .await?;

        let items = ist.next_page().await?;
        let items = ist.next_page().await?;

        Ok(())
    }

    pub async fn update(&self) -> anyhow::Result<()> {
        // let keys: HashSet<String> = artist_keys.into_iter().collect();
        // let albumss = self.client.fetch_albums(todo!()).await?;

        // let albums = albums
        //     .into_iter()
        //     .filter(|a| {
        //         a.author
        //             .as_ref()
        //             .map(|a| a.channel_id.as_ref().map(|id| keys.contains(id)))
        //             .flatten()
        //             .unwrap_or(false)
        //     })
        //     .collect();
        Ok(())
    }
}

pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
    let mut types = String::new();
    types +=
        "import type { ReleaseGroupWithInfo, ReleaseWithInfo, Recording } from '$types/mbz.ts';\n";
    types += "import type { Album, Video } from '$types/yt.ts';\n";
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
