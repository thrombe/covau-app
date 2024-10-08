use serde::{Deserialize, Serialize};

fn type_to_string<S: Serialize>(s: S) -> String {
    let s = serde_json::to_string(&s).unwrap();
    let s1 = s.strip_prefix("\"").unwrap_or(&s);
    let s2 = s1.strip_suffix("\"").unwrap_or(s1);
    s2.into()
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Recording {
    pub title: String,
    pub id: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct RecordingWithInfo {
    #[serde(flatten)]
    pub recording: Recording,
    pub releases: Vec<ReleaseWithInfo>,
    pub credit: Vec<Artist>,

    pub cover_art: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct ReleaseGroup {
    pub id: String,
    pub title: String,
    pub primary_type: Option<String>,
    pub secondary_types: Vec<String>,
    pub disambiguation: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct ReleaseGroupWithInfo {
    #[serde(flatten)]
    pub group: ReleaseGroup,
    pub releases: Vec<Release>,
    pub credit: Vec<Artist>,

    pub cover_art: Option<String>,
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

    pub cover_art: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Artist {
    pub name: String,
    pub id: String,
    pub aliases: Vec<Alias>,
    pub disambiguation: Option<String>,
    #[serde(rename = "type")]
    pub typ: Option<String>,
    pub area: Option<Area>,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct WithUrlRels<T> {
    pub item: T,
    pub urls: Vec<Url>,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Url {
    pub id: String,
    pub url: String,
    #[serde(rename = "type")]
    pub typ: String,
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
    pub typ: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
#[serde(tag = "type", content = "content")]
pub enum SearchQuery {
    Search { query: String, page_size: i32 },
    Continuation(SearchContinuation),
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct SearchContinuation {
    pub query: String,
    pub offset: i32,
    pub count: i32,
    pub page_size: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct SearchResults<T> {
    pub items: Vec<T>,
    pub continuation: Option<SearchContinuation>,
}

#[async_trait::async_trait]
pub trait PagedSearch
where
    Self: Sized,
{
    async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>>;
}
#[async_trait::async_trait]
pub trait IdSearch
where
    Self: Sized,
{
    async fn get(id: &str) -> anyhow::Result<Self>;
}

pub mod listenbrainz {
    use serde::{Deserialize, Serialize};

    const BASE_URL: &'static str = "https://api.listenbrainz.org/1/explore/lb-radio";

    #[derive(Serialize, Deserialize, Clone, Debug)]
    #[serde(untagged)]
    pub enum QueryResult {
        Ok { payload: Payload },
        Err { code: u32, error: String },
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub enum Mode {
        Easy,
        Medium,
        Hard,
    }
    impl Mode {
        fn path(&self) -> &'static str {
            match self {
                Mode::Easy => "easy",
                Mode::Medium => "medium",
                Mode::Hard => "hard",
            }
        }
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Payload {
        pub feedback: Vec<String>,
        pub jspf: Jspf,
    }
    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Jspf {
        pub playlist: Playlist,
    }
    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Playlist {
        pub annotation: String,
        pub creator: String,
        // extension: {
        //   "https://musicbrainz.org/doc/jspf#playlist": {
        //     "public": true
        //   }
        // },
        pub title: String,
        pub track: Vec<RadioSong>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct RadioSong {
        pub album: Option<String>,
        pub creator: String,
        pub duration: Option<u32>,
        // extension: {
        //   "https://musicbrainz.org/doc/jspf#track": {
        //     "artist_identifiers": [
        //       "741a8da6-9b87-4b49-acda-6cc6d9f579ac",
        //       "9388cee2-7d57-4598-905f-106019b267d3"
        //     ],
        //     "release_identifier": "https://musicbrainz.org/release/6c73de8b-3c61-4ab7-b7fa-9aeb4e3946c6"
        //   }
        // },
        pub identifier: Vec<String>, // mbz links
        pub title: String,
    }

    pub async fn explore(
        client: reqwest::Client,
        query: String,
        mode: Mode,
    ) -> anyhow::Result<QueryResult> {
        let req = client.get(format!("{BASE_URL}?mode={}&prompt={}", mode.path(), &query));
        let res = client.execute(req.build()?).await?;
        // let res = res.text().await?;
        // dbg!(&res);
        // let res = serde_json::from_str(&res)?;
        let res = res.json().await?;
        Ok(res)
    }
}

#[cfg(feature = "appdeps")]
pub use trait_impls::*;
#[cfg(feature = "appdeps")]
mod trait_impls {
    use super::*;
    use musicbrainz_rs::{
        entity::{
            alias, area, artist, artist_credit, recording, relations, release, release_group,
        },
        Browse, Fetch, Search,
    };

    impl From<recording::Recording> for Recording {
        fn from(r: recording::Recording) -> Self {
            Self {
                title: r.title,
                id: r.id,
            }
        }
    }

    impl From<recording::Recording> for RecordingWithInfo {
        fn from(r: recording::Recording) -> Self {
            Self {
                releases: r
                    .releases
                    .clone()
                    .into_iter()
                    .flatten()
                    .map(Into::into)
                    .collect(),
                credit: r
                    .artist_credit
                    .clone()
                    .into_iter()
                    .flatten()
                    .map(Into::into)
                    .collect(),
                recording: r.into(),
                cover_art: None,
            }
        }
    }

    impl From<release_group::ReleaseGroup> for ReleaseGroup {
        fn from(g: release_group::ReleaseGroup) -> Self {
            Self {
                id: g.id,
                title: g.title,
                primary_type: g.primary_type.map(type_to_string),
                secondary_types: g.secondary_types.into_iter().map(type_to_string).collect(),
                disambiguation: g.disambiguation,
            }
        }
    }

    impl From<release_group::ReleaseGroup> for ReleaseGroupWithInfo {
        fn from(mut g: release_group::ReleaseGroup) -> Self {
            Self {
                releases: g
                    .releases
                    .take()
                    .into_iter()
                    .flatten()
                    .map(Into::into)
                    .collect(),
                credit: g
                    .artist_credit
                    .take()
                    .into_iter()
                    .flatten()
                    .map(Into::into)
                    .collect(),
                cover_art: None,
                group: g.into(),
            }
        }
    }

    impl From<release::Media> for ReleaseMedia {
        fn from(m: release::Media) -> Self {
            Self {
                track_count: m.track_count,
                format: m.format,
            }
        }
    }

    impl From<release::Release> for Release {
        fn from(r: release::Release) -> Self {
            Self {
                id: r.id,
                title: r.title,
            }
        }
    }

    impl From<release::Release> for ReleaseWithInfo {
        fn from(r: release::Release) -> Self {
            Self {
                release: Release {
                    id: r.id,
                    title: r.title,
                },
                release_group: r.release_group.map(Into::into),
                media: r.media.into_iter().flatten().map(Into::into).collect(),
                credit: r
                    .artist_credit
                    .into_iter()
                    .flatten()
                    .map(Into::into)
                    .collect(),
                cover_art: None,
            }
        }
    }

    impl From<artist_credit::ArtistCredit> for Artist {
        fn from(c: artist_credit::ArtistCredit) -> Self {
            c.artist.into()
        }
    }

    impl From<artist::Artist> for Artist {
        fn from(a: artist::Artist) -> Self {
            Self {
                name: a.name,
                id: a.id,
                aliases: a.aliases.into_iter().flatten().map(Into::into).collect(),
                disambiguation: (a.disambiguation.len() > 0).then_some(a.disambiguation),
                typ: a.artist_type.map(type_to_string),
                area: a.area.map(Into::into),
            }
        }
    }

    impl From<artist::Artist> for WithUrlRels<Artist> {
        fn from(mut a: artist::Artist) -> Self {
            let urls = a
                .relations
                .take()
                .into_iter()
                .flatten()
                .filter_map(|r| match r.content {
                    relations::RelationContent::Url(u) => Some(Url {
                        id: u.id,
                        url: u.resource,
                        typ: r.relation_type,
                    }),
                    _ => None,
                })
                .collect();
            Self {
                item: a.into(),
                urls,
            }
        }
    }

    impl From<area::Area> for Area {
        fn from(a: area::Area) -> Self {
            Self {
                name: a.name,
                id: a.id,
            }
        }
    }

    impl From<alias::Alias> for Alias {
        fn from(a: alias::Alias) -> Self {
            Self {
                name: a.name,
                typ: a.alias_type.map(type_to_string),
            }
        }
    }

    #[async_trait::async_trait]
    pub trait Linked<A>
    where
        Self: Sized,
    {
        async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>>;
    }

    #[async_trait::async_trait]
    impl Linked<artist::Artist> for ReleaseGroup {
        async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>> {
            let (query, page_size, offset) = match query {
                SearchQuery::Search { query, page_size } => (query, page_size, 0),
                SearchQuery::Continuation(c) => (c.query, c.page_size, c.offset),
            };
            let r = release_group::ReleaseGroup::browse()
                .by_artist(&query)
                .limit(page_size as _)
                .offset(offset as _)
                .execute()
                .await?;

            let offset = r.offset + r.entities.len() as i32;
            let items = r.entities.into_iter().map(Into::into).collect();
            let res = SearchResults {
                continuation: (offset < r.count).then_some(SearchContinuation {
                    query,
                    offset,
                    count: r.count,
                    page_size,
                }),
                items,
            };
            Ok(res)
        }
    }
    #[async_trait::async_trait]
    impl Linked<artist::Artist> for Release {
        async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>> {
            let (query, page_size, offset) = match query {
                SearchQuery::Search { query, page_size } => (query, page_size, 0),
                SearchQuery::Continuation(c) => (c.query, c.page_size, c.offset),
            };
            let r = release::Release::browse()
                .by_artist(&query)
                .limit(page_size as _)
                .offset(offset as _)
                .execute()
                .await?;

            let offset = r.offset + r.entities.len() as i32;
            let items = r.entities.into_iter().map(Into::into).collect();
            let res = SearchResults {
                continuation: (offset < r.count).then_some(SearchContinuation {
                    query,
                    offset,
                    count: r.count,
                    page_size,
                }),
                items,
            };
            Ok(res)
        }
    }
    #[async_trait::async_trait]
    impl Linked<artist::Artist> for Recording {
        async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>> {
            let (query, page_size, offset) = match query {
                SearchQuery::Search { query, page_size } => (query, page_size, 0),
                SearchQuery::Continuation(c) => (c.query, c.page_size, c.offset),
            };
            let r = recording::Recording::browse()
                .by_artist(&query)
                .limit(page_size as _)
                .offset(offset as _)
                .execute()
                .await?;

            let offset = r.offset + r.entities.len() as i32;
            let items = r.entities.into_iter().map(Into::into).collect();
            let res = SearchResults {
                continuation: (offset < r.count).then_some(SearchContinuation {
                    query,
                    offset,
                    count: r.count,
                    page_size,
                }),
                items,
            };
            Ok(res)
        }
    }
    #[async_trait::async_trait]
    impl Linked<release_group::ReleaseGroup> for Release {
        async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>> {
            let (query, page_size, offset) = match query {
                SearchQuery::Search { query, page_size } => (query, page_size, 0),
                SearchQuery::Continuation(c) => (c.query, c.page_size, c.offset),
            };
            let r = release::Release::browse()
                .by_release_group(&query)
                .limit(page_size as _)
                .offset(offset as _)
                .execute()
                .await?;

            let offset = r.offset + r.entities.len() as i32;
            let items = r.entities.into_iter().map(Into::into).collect();
            let res = SearchResults {
                continuation: (offset < r.count).then_some(SearchContinuation {
                    query,
                    offset,
                    count: r.count,
                    page_size,
                }),
                items,
            };
            Ok(res)
        }
    }
    #[async_trait::async_trait]
    impl Linked<release::Release> for Recording {
        async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>> {
            let (query, page_size, offset) = match query {
                SearchQuery::Search { query, page_size } => (query, page_size, 0),
                SearchQuery::Continuation(c) => (c.query, c.page_size, c.offset),
            };
            let r = recording::Recording::browse()
                .by_release(&query)
                .limit(page_size as _)
                .offset(offset as _)
                .execute()
                .await?;

            let offset = r.offset + r.entities.len() as i32;
            let items = r.entities.into_iter().map(Into::into).collect();
            let res = SearchResults {
                continuation: (offset < r.count).then_some(SearchContinuation {
                    query,
                    offset,
                    count: r.count,
                    page_size,
                }),
                items,
            };
            Ok(res)
        }
    }

    #[async_trait::async_trait]
    impl PagedSearch for RecordingWithInfo {
        async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>> {
            let (query, page_size, offset) = match query {
                SearchQuery::Search { query, page_size } => (query, page_size, 0),
                SearchQuery::Continuation(c) => (c.query, c.page_size, c.offset),
            };

            let r = recording::Recording::search(format!(
                "method=advanced&limit={}&offset={}&query={}",
                page_size, offset, query
            ))
            .execute()
            .await?;

            // TODO: cover art
            let offset = r.offset + r.entities.len() as i32;
            let items = r.entities.into_iter().map(Into::into).collect();
            let res = SearchResults {
                continuation: (offset < r.count).then_some(SearchContinuation {
                    query,
                    offset,
                    count: r.count,
                    page_size,
                }),
                items,
            };
            Ok(res)
        }
    }

    #[async_trait::async_trait]
    impl PagedSearch for ReleaseWithInfo {
        async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>> {
            let (query, page_size, offset) = match query {
                SearchQuery::Search { query, page_size } => (query, page_size, 0),
                SearchQuery::Continuation(c) => (c.query, c.page_size, c.offset),
            };

            let r = release::Release::search(format!(
                "method=advanced&limit={}&offset={}&query={}",
                page_size, offset, query
            ))
            .execute()
            .await?;

            // TODO: cover art
            let offset = r.offset + r.entities.len() as i32;
            let items = r.entities.into_iter().map(Into::into).collect();
            let res = SearchResults {
                continuation: (offset < r.count).then_some(SearchContinuation {
                    query,
                    offset,
                    count: r.count,
                    page_size,
                }),
                items,
            };
            Ok(res)
        }
    }

    #[async_trait::async_trait]
    impl PagedSearch for ReleaseGroupWithInfo {
        async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>> {
            let (query, page_size, offset) = match query {
                SearchQuery::Search { query, page_size } => (query, page_size, 0),
                SearchQuery::Continuation(c) => (c.query, c.page_size, c.offset),
            };

            let r = release_group::ReleaseGroup::search(format!(
                "method=advanced&limit={}&offset={}&query={}",
                page_size, offset, query
            ))
            .execute()
            .await?;

            // TODO: cover art
            let offset = r.offset + r.entities.len() as i32;
            let items = r.entities.into_iter().map(Into::into).collect();
            let res = SearchResults {
                continuation: (offset < r.count).then_some(SearchContinuation {
                    query,
                    offset,
                    count: r.count,
                    page_size,
                }),
                items,
            };
            Ok(res)
        }
    }

    #[async_trait::async_trait]
    impl PagedSearch for Artist {
        async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>> {
            let (query, page_size, offset) = match query {
                SearchQuery::Search { query, page_size } => (query, page_size, 0),
                SearchQuery::Continuation(c) => (c.query, c.page_size, c.offset),
            };

            let r = artist::Artist::search(format!(
                "method=advanced&limit={}&offset={}&query={}",
                page_size, offset, query
            ))
            .execute()
            .await?;

            let offset = r.offset + r.entities.len() as i32;
            let items = r.entities.into_iter().map(Into::into).collect();
            let res = SearchResults {
                continuation: (offset < r.count).then_some(SearchContinuation {
                    query,
                    offset,
                    count: r.count,
                    page_size,
                }),
                items,
            };
            Ok(res)
        }
    }

    #[async_trait::async_trait]
    impl IdSearch for WithUrlRels<Artist> {
        async fn get(id: &str) -> anyhow::Result<Self> {
            let r = artist::Artist::fetch()
                .id(id)
                .with_url_relations()
                .execute()
                .await?;
            let res = r.into();
            Ok(res)
        }
    }

    #[async_trait::async_trait]
    impl IdSearch for Artist {
        async fn get(id: &str) -> anyhow::Result<Self> {
            let r = artist::Artist::fetch().id(id).execute().await?;
            let res = r.into();
            Ok(res)
        }
    }

    #[async_trait::async_trait]
    impl IdSearch for ReleaseWithInfo {
        async fn get(id: &str) -> anyhow::Result<Self> {
            let r = release::Release::fetch()
                .id(id)
                .with_artists()
                .with_release_groups()
                // .with_recordings()
                .execute()
                .await?;
            let res = r.into();
            Ok(res)
        }
    }

    #[async_trait::async_trait]
    impl IdSearch for ReleaseGroupWithInfo {
        async fn get(id: &str) -> anyhow::Result<Self> {
            let r = release_group::ReleaseGroup::fetch()
                .id(id)
                .with_artists()
                .with_releases()
                .execute()
                .await?;
            let res = r.into();
            Ok(res)
        }
    }

    #[async_trait::async_trait]
    impl IdSearch for RecordingWithInfo {
        async fn get(id: &str) -> anyhow::Result<Self> {
            let r = recording::Recording::fetch()
                .id(id)
                .with_artists()
                .with_releases()
                .execute()
                .await?;
            let res = r.into();
            Ok(res)
        }
    }
}

#[cfg(feature = "appdeps")]
pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
    let mut types = String::new();
    types += &specta::ts::export::<Recording>(config)?;
    types += ";\n";
    types += &specta::ts::export::<RecordingWithInfo>(config)?;
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
    types += &specta::ts::export::<WithUrlRels<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<SearchQuery>(config)?;
    types += ";\n";
    types += &specta::ts::export::<SearchContinuation>(config)?;
    types += ";\n";
    types += &specta::ts::export::<SearchResults<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<listenbrainz::RadioSong>(config)?;
    types += ";\n";

    Ok(types)
}

#[cfg(feature = "appdeps")]
pub async fn api_test() -> anyhow::Result<()> {
    // use musicbrainz_rs::{
    //     entity::{
    //         alias, area, artist, artist_credit, coverart, recording, relations, release,
    //         release_group, search::Searchable, work::Work, Browsable, BrowseResult,
    //     },
    //     Browse, Fetch, FetchCoverart, Path, Search,
    // };

    // let r = artist::Artist::search("query=aimer".into()).execute().await?;
    // dbg!(&r);
    // let r = recording::Recording::browse()
    //     .by_artist(&r.entities[0].id)
    //     // .with_releases()
    //     .execute()
    //     .await?;
    // dbg!(&r);
    // let r = recording::Recording::fetch().id(&r.entities[0].id).with_artists().with_releases().execute().await?;
    // dbg!(&r);

    // let r = Work::search("method=indexed&query=violence".into()).execute().await?;
    // let r = release::Release::search("query=visions milet".into()).execute().await?;
    // let r = release_group::ReleaseGroup::search("query=visions milet".into())
    //     .execute()
    //     .await?;
    // let r = Release::browse().execute().await;
    // println!("{}", serde_json::to_string_pretty(&r)?);
    // let r = release_group::ReleaseGroup::fetch_coverart()
    //     .id(&r.entities[0].id)
    //     .execute()
    //     .await?;

    // println!("{}", serde_json::to_string_pretty(&r)?);

    // let r = Artist::search(SearchQuery::Search {
    //     query: "aimer".into(),
    //     page_size: 10,
    // })
    // .await?;
    // dbg!(&r);
    // let r2 = Artist::search(SearchQuery::Continuation(r.continuation.unwrap())).await?;
    // dbg!(&r2);
    // let r3 = WithUrlRels::<Artist>::get(&r.items[0].id).await?;
    // dbg!(&r3);

    Ok(())
}
