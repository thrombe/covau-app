use musicbrainz_rs::{
    entity::{
        alias, area, artist, artist_credit, coverart, recording, relations, release, release_group,
        work::Work,
    },
    Fetch, FetchCoverart, Search,
};
use serde::{Deserialize, Serialize};

fn type_to_string<S: Serialize>(s: S) -> String {
    serde_json::to_string(&s).unwrap()
}

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
    pub primary_type: Option<String>,
    pub secondary_types: Vec<String>,
    pub disambiguation: String,
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

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct ReleaseGroupWithInfo {
    #[serde(flatten)]
    pub group: ReleaseGroup,
    pub releases: Vec<Release>,
    pub credit: Vec<Artist>,

    pub cover_art: Option<String>,
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

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct ReleaseMedia {
    pub track_count: u32,
    pub format: Option<String>,
}

impl From<release::Media> for ReleaseMedia {
    fn from(m: release::Media) -> Self {
        Self {
            track_count: m.track_count,
            format: m.format,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Release {
    pub id: String,
    pub title: String,
}

impl From<release::Release> for Release {
    fn from(r: release::Release) -> Self {
        Self {
            id: r.id,
            title: r.title,
        }
    }
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
            disambiguation: a.disambiguation,
            typ: a.artist_type.map(type_to_string),
            area: a.area.map(Into::into),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct WithUrlRels<T> {
    pub item: T,
    pub urls: Vec<Url>,
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

impl From<area::Area> for Area {
    fn from(a: area::Area) -> Self {
        Self {
            name: a.name,
            id: a.id,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct Alias {
    pub name: String,
    #[serde(rename = "type")]
    pub typ: Option<String>,
}

impl From<alias::Alias> for Alias {
    fn from(a: alias::Alias) -> Self {
        Self {
            name: a.name,
            typ: a.alias_type.map(type_to_string),
        }
    }
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

#[sea_orm::prelude::async_trait::async_trait]
pub trait PagedSearch
where
    Self: Sized,
{
    async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>>;
}
#[sea_orm::prelude::async_trait::async_trait]
pub trait IdSearch
where
    Self: Sized,
{
    async fn get(id: &str) -> anyhow::Result<Self>;
}

#[sea_orm::prelude::async_trait::async_trait]
impl PagedSearch for ReleaseWithInfo {
    async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>> {
        let (query, page_size, offset) = match query {
            SearchQuery::Search { query, page_size } => (query, page_size, 0),
            SearchQuery::Continuation(c) => (c.query, c.page_size, c.offset),
        };

        let r = release::Release::search(format!(
            "limit={}&offset={}&query={}",
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

#[sea_orm::prelude::async_trait::async_trait]
impl PagedSearch for ReleaseGroupWithInfo {
    async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>> {
        let (query, page_size, offset) = match query {
            SearchQuery::Search { query, page_size } => (query, page_size, 0),
            SearchQuery::Continuation(c) => (c.query, c.page_size, c.offset),
        };

        let r = release_group::ReleaseGroup::search(format!(
            "limit={}&offset={}&query={}",
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

#[sea_orm::prelude::async_trait::async_trait]
impl PagedSearch for Artist {
    async fn search(query: SearchQuery) -> anyhow::Result<SearchResults<Self>> {
        let (query, page_size, offset) = match query {
            SearchQuery::Search { query, page_size } => (query, page_size, 0),
            SearchQuery::Continuation(c) => (c.query, c.page_size, c.offset),
        };

        let r = artist::Artist::search(format!(
            "limit={}&offset={}&query={}",
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

#[sea_orm::prelude::async_trait::async_trait]
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
    types += &specta::ts::export::<SearchQuery>(config)?;
    types += ";\n";
    types += &specta::ts::export::<SearchContinuation>(config)?;
    types += ";\n";
    types += &specta::ts::export::<SearchResults<()>>(config)?;
    types += ";\n";

    Ok(types)
}

pub async fn api_test() -> anyhow::Result<()> {
    // limit=
    // offset=
    // let r = artist::Artist::search("query=aimer&inc=url-rels".into()).execute().await?;
    // let r = recording::Recording::search("method=indexed&query=rejuvenation queen bee".into())
    //     .execute()
    //     .await?;
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

    let r = Artist::search(SearchQuery::Search {
        query: "aimer".into(),
        page_size: 10,
    })
    .await?;
    dbg!(&r);
    let r2 = Artist::search(SearchQuery::Continuation(r.continuation.unwrap())).await?;
    dbg!(&r2);
    let r3 = WithUrlRels::<Artist>::get(&r.items[0].id).await?;
    dbg!(&r3);

    Ok(())
}