use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[cfg_attr(
    feature = "bindeps",
    derive(sea_orm::EnumIter, sea_orm::DeriveActiveEnum),
    sea_orm(rs_type = "i32", db_type = "Integer")
)]
#[cfg_attr(
    feature = "wasmdeps",
    derive(tsify_next::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub enum Typ {
    #[cfg_attr(feature = "bindeps", sea_orm(num_value = 1))]
    MmSong,
    #[cfg_attr(feature = "bindeps", sea_orm(num_value = 2))]
    MmAlbum,
    #[cfg_attr(feature = "bindeps", sea_orm(num_value = 3))]
    MmArtist,
    #[cfg_attr(feature = "bindeps", sea_orm(num_value = 4))]
    MmPlaylist,
    #[cfg_attr(feature = "bindeps", sea_orm(num_value = 5))]
    MmQueue,
    #[cfg_attr(feature = "bindeps", sea_orm(num_value = 6))]
    Song,
    #[cfg_attr(feature = "bindeps", sea_orm(num_value = 7))]
    Playlist,
    #[cfg_attr(feature = "bindeps", sea_orm(num_value = 8))]
    Queue,
    #[cfg_attr(feature = "bindeps", sea_orm(num_value = 9))]
    Updater,
    #[cfg_attr(feature = "bindeps", sea_orm(num_value = 10))]
    StSong,
    #[cfg_attr(feature = "bindeps", sea_orm(num_value = 11))]
    StVideo,
    #[cfg_attr(feature = "bindeps", sea_orm(num_value = 12))]
    StAlbum,
    #[cfg_attr(feature = "bindeps", sea_orm(num_value = 13))]
    StPlaylist,
    #[cfg_attr(feature = "bindeps", sea_orm(num_value = 14))]
    StArtist,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
#[cfg_attr(
    feature = "wasmdeps",
    derive(tsify_next::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct SearchMatches<T> {
    pub items: Vec<DbItem<T>>,
    pub continuation: Option<SearchContinuation>,
}
#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
#[cfg_attr(
    feature = "wasmdeps",
    derive(tsify_next::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct DbItem<T> {
    pub id: i32,
    pub typ: Typ,
    pub t: T,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
#[cfg_attr(
    feature = "wasmdeps",
    derive(tsify_next::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct SearchContinuation {
    pub typ: Typ,
    pub page_size: u32,
    pub query: String,
    pub cont: String, // score + id
}
#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
#[serde(tag = "type", content = "content")]
#[cfg_attr(
    feature = "wasmdeps",
    derive(tsify_next::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub enum SearchQuery {
    Query { page_size: u32, query: String },
    Continuation(SearchContinuation),
}

#[cfg(feature = "bindeps")]
pub use db::*;
#[cfg(feature = "bindeps")]
pub mod db {
    use std::collections::HashSet;

    use intrusive_collections::{intrusive_adapter, KeyAdapter, RBTreeLink};
    use sea_orm::RelationTrait;
    use sea_orm::{entity::prelude::*, Schema};
    use sea_orm::{Condition, DeriveEntityModel, QuerySelect};
    use tokio_stream::StreamExt;

    use super::*;

    pub trait DbAble: Serialize + for<'de> Deserialize<'de> + std::fmt::Debug + Clone {
        fn to_json(&self) -> String;
        fn typ() -> Typ;
        fn haystack(&self) -> impl IntoIterator<Item = &str>;
        fn refids(&self) -> impl IntoIterator<Item = &str>;
    }
    pub trait AutoDbAble {
        fn typ() -> Typ;
        fn haystack(&self) -> impl IntoIterator<Item = &str>;
        fn refids(&self) -> impl IntoIterator<Item = &str> {
            []
        }
    }
    impl<T> DbAble for T
    where
        T: Serialize + for<'de> Deserialize<'de> + std::fmt::Debug + Clone + AutoDbAble,
    {
        fn to_json(&self) -> String {
            serde_json::to_string(self).expect("won't fail")
        }
        fn typ() -> Typ {
            <Self as AutoDbAble>::typ()
        }
        fn haystack(&self) -> impl IntoIterator<Item = &str> {
            <Self as AutoDbAble>::haystack(self)
        }
        fn refids(&self) -> impl IntoIterator<Item = &str> {
            <Self as AutoDbAble>::refids(self)
        }
    }

    mod covau_types {
        use super::*;
        use crate::covau_types::*;

        impl AutoDbAble for Song {
            fn typ() -> Typ {
                Typ::Song
            }

            fn haystack(&self) -> impl IntoIterator<Item = &str> {
                self.haystacks
                    .iter()
                    .map(String::as_str)
                    .collect::<Vec<_>>()
            }

            fn refids(&self) -> impl IntoIterator<Item = &str> {
                let mut hs = vec![];

                for id in self.info_sources.iter() {
                    match id {
                        InfoSource::YtId(id) => {
                            hs.push(id.as_ref());
                        }
                        InfoSource::MbzId(id) => {
                            hs.push(id.as_ref());
                        }
                    }
                }
                for id in self.play_sources.iter() {
                    match id {
                        PlaySource::File(id) => {
                            hs.push(id.as_ref());
                        }
                        PlaySource::YtId(id) => {
                            hs.push(id.as_ref());
                        }
                    }
                }

                hs
            }
        }
        impl AutoDbAble for Playlist {
            fn typ() -> Typ {
                Typ::Playlist
            }

            fn haystack(&self) -> impl IntoIterator<Item = &str> {
                [self.title.as_ref()]
            }
        }
        impl AutoDbAble for Queue {
            fn typ() -> Typ {
                Typ::Queue
            }

            fn haystack(&self) -> impl IntoIterator<Item = &str> {
                [self.0.queue.title.as_ref()]
            }
        }
        impl AutoDbAble for Updater {
            fn typ() -> Typ {
                Typ::Updater
            }

            fn haystack(&self) -> impl IntoIterator<Item = &str> {
                [self.title.as_ref()]
            }

            fn refids(&self) -> impl IntoIterator<Item = &str> {
                let mut rids = vec![];
                match &self.source {
                    UpdateSource::Mbz { artist_id, .. } => {
                        rids.push(artist_id.as_str());
                    }
                    UpdateSource::MusimanagerSearch { artist_keys, .. } => {
                        rids.extend(artist_keys.iter().map(String::as_str));
                    }
                    UpdateSource::SongTubeSearch { artist_keys, .. } => {
                        rids.extend(artist_keys.iter().map(String::as_str));
                    }
                }
                rids
            }
        }
    }

    mod yt {
        use super::*;
        use crate::yt::song_tube::*;

        impl AutoDbAble for Song {
            fn typ() -> db::Typ {
                db::Typ::StSong
            }

            fn haystack(&self) -> impl IntoIterator<Item = &str> {
                let mut hs = vec![];

                self.title.as_deref().map(|a| {
                    hs.push(a);
                });

                self.authors
                    .iter()
                    .map(|a| a.name.as_str())
                    .for_each(|n| hs.push(n));

                self.album
                    .as_ref()
                    .map(|a| a.name.as_str())
                    .map(|n| hs.push(n));

                hs
            }

            fn refids(&self) -> impl IntoIterator<Item = &str> {
                [self.id.as_ref()]
            }
        }
        impl AutoDbAble for Video {
            fn typ() -> db::Typ {
                db::Typ::StVideo
            }

            fn haystack(&self) -> impl IntoIterator<Item = &str> {
                let mut hs = vec![];

                self.title.as_deref().map(|a| {
                    hs.push(a);
                });

                self.authors
                    .iter()
                    .map(|a| a.name.as_str())
                    .for_each(|n| hs.push(n));

                hs
            }

            fn refids(&self) -> impl IntoIterator<Item = &str> {
                [self.id.as_ref()]
            }
        }
        impl AutoDbAble for Album {
            fn typ() -> db::Typ {
                db::Typ::StAlbum
            }

            fn haystack(&self) -> impl IntoIterator<Item = &str> {
                let mut hs = vec![];

                self.title.as_deref().map(|a| {
                    hs.push(a);
                });

                self.author
                    .as_ref()
                    .map(|a| a.name.as_str())
                    .map(|n| hs.push(n));

                hs
            }

            fn refids(&self) -> impl IntoIterator<Item = &str> {
                [self.id.as_ref()]
            }
        }
        impl AutoDbAble for Playlist {
            fn typ() -> db::Typ {
                db::Typ::StPlaylist
            }

            fn haystack(&self) -> impl IntoIterator<Item = &str> {
                let mut hs = vec![];

                self.title.as_deref().map(|a| {
                    hs.push(a);
                });

                self.author
                    .as_ref()
                    .map(|a| a.name.as_str())
                    .map(|n| hs.push(n));

                hs
            }

            fn refids(&self) -> impl IntoIterator<Item = &str> {
                [self.id.as_ref()]
            }
        }
        impl AutoDbAble for Artist {
            fn typ() -> db::Typ {
                db::Typ::StArtist
            }

            fn haystack(&self) -> impl IntoIterator<Item = &str> {
                let mut hs = vec![];

                self.name.as_deref().map(|a| {
                    hs.push(a);
                });

                hs
            }

            fn refids(&self) -> impl IntoIterator<Item = &str> {
                [self.id.as_ref()]
            }
        }
    }

    mod musimanager {
        use super::*;
        use crate::musimanager::*;

        impl AutoDbAble for Song<Option<SongInfo>> {
            fn typ() -> Typ {
                Typ::MmSong
            }

            fn haystack(&self) -> impl IntoIterator<Item = &str> {
                let mut hs = vec![self.title.as_str()];

                self.artist_name.as_deref().map(|a| {
                    hs.push(a);
                });

                hs
            }

            fn refids(&self) -> impl IntoIterator<Item = &str> {
                [self.key.as_str()]
            }
        }
        impl AutoDbAble for Album<SongId> {
            fn typ() -> Typ {
                Typ::MmAlbum
            }

            fn haystack(&self) -> impl IntoIterator<Item = &str> {
                [self.name.as_str(), self.artist_name.as_str()]
            }

            fn refids(&self) -> impl IntoIterator<Item = &str> {
                [self.browse_id.as_str()]
            }
        }
        impl AutoDbAble for Artist<SongId, AlbumId> {
            fn typ() -> Typ {
                Typ::MmArtist
            }

            fn haystack(&self) -> impl IntoIterator<Item = &str> {
                [self.name.as_str()]
            }

            // fn refids(&self) -> impl IntoIterator<Item = &str> {
            //     self.keys.iter().map(String::as_str).collect::<Vec<_>>()
            // }
        }
        impl AutoDbAble for Playlist<SongId> {
            fn typ() -> Typ {
                Typ::MmPlaylist
            }

            fn haystack(&self) -> impl IntoIterator<Item = &str> {
                [self.0.name.as_str()]
            }
        }
        impl AutoDbAble for Queue<SongId> {
            fn typ() -> Typ {
                Typ::MmQueue
            }

            fn haystack(&self) -> impl IntoIterator<Item = &str> {
                [self.0.name.as_str()]
            }
        }
    }

    mod object {
        use super::*;

        #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
        #[sea_orm(table_name = "covau_objects")]
        pub struct Model {
            #[sea_orm(primary_key, auto_increment = true)]
            pub id: i32,
            pub data: String,
            pub typ: Typ,
        }
        impl Model {
            pub fn parsed_assume<T: for<'de> Deserialize<'de>>(&self) -> T {
                let t: T = serde_json::from_str(&self.data).expect("parsing Model json failed");
                t
            }
            pub fn parsed<T: DbAble>(&self) -> anyhow::Result<T> {
                if T::typ() != self.typ {
                    return Err(anyhow::anyhow!("model type mismatch"));
                }
                let t: T = serde_json::from_str(&self.data)?;
                Ok(t)
            }
        }

        #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
        pub enum Relation {
            #[sea_orm(has_many = "super::refid::Entity")]
            RefId,
        }
        impl Related<super::refid::Entity> for Entity {
            fn to() -> RelationDef {
                Relation::RefId.def()
            }
        }

        #[async_trait::async_trait]
        impl ActiveModelBehavior for ActiveModel {
            async fn before_delete<C>(self, db: &C) -> Result<Self, DbErr>
            where
                C: ConnectionTrait,
            {
                // super::refid::Entity::delete_many()
                //     .filter(
                //         super::refid::Column::Typ
                //             .contains(self.typ.clone().unwrap().to_value().to_string()),
                //     )
                //     .filter(
                //         super::refid::Column::ObjectId
                //             .contains(self.id.clone().unwrap().to_string()),
                //     )
                //     .exec(db)
                //     .await?;
                Ok(self)
            }
        }
    }
    mod refid {
        use super::*;

        /// any other kind of id that we might need to match on
        /// for example SongId -> Song

        #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
        #[sea_orm(table_name = "ref_ids")]
        pub struct Model {
            #[sea_orm(primary_key)]
            pub refid: String,
            #[sea_orm(primary_key)]
            pub typ: Typ,
            pub object_id: i32,
        }

        #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
        pub enum Relation {
            #[sea_orm(
                belongs_to = "super::object::Entity",
                from = "Column::ObjectId",
                to = "super::object::Column::Id"
            )]
            Object,
        }
        impl Related<super::object::Entity> for Entity {
            fn to() -> RelationDef {
                Relation::Object.def()
            }
        }

        impl ActiveModelBehavior for ActiveModel {}
    }

    #[derive(Clone)]
    pub struct Db {
        pub db: sea_orm::DatabaseConnection,
    }
    impl Db {
        pub async fn new(path: impl AsRef<str>) -> anyhow::Result<Self> {
            let db = Db {
                db: sea_orm::Database::connect(path.as_ref()).await?,
            };
            Ok(db)
        }

        pub async fn init_tables(&self) -> anyhow::Result<()> {
            let builder = self.db.get_database_backend();
            let schema = Schema::new(builder);
            let s = builder.build(&schema.create_table_from_entity(object::Entity));
            let _ = self.db.execute(s).await?;
            let s = builder.build(&schema.create_table_from_entity(refid::Entity));
            let _ = self.db.execute(s).await?;
            let s = builder.build(
                &sea_orm::sea_query::Index::create()
                    .name("refid_index")
                    .table(refid::Entity)
                    .col(refid::Column::Refid)
                    .to_owned(),
            );
            let _ = self.db.execute(s).await?;

            {
                let path = "/home/issac/0Git/musimanager/db/musitracker.json";

                let data = std::fs::read_to_string(path)?;

                let tracker = serde_json::from_str::<crate::musimanager::Tracker>(&data)?.clean();
                for s in tracker.songs.into_iter() {
                    self.insert(s).await?;
                }
                for a in tracker.artists.into_iter() {
                    self.insert(a).await?;
                }
                for a in tracker.albums.into_iter() {
                    self.insert(a).await?;
                }
                for p in tracker.playlists.into_iter() {
                    self.insert(p).await?;
                }
                for q in tracker.queues.into_iter() {
                    self.insert(q).await?;
                }
            }

            Ok(())
        }

        pub async fn stream_models<T: DbAble>(
            &self,
        ) -> anyhow::Result<impl futures::Stream<Item = Result<object::Model, DbErr>> + '_>
        {
            let a = object::Entity::find()
                .filter(object::Column::Typ.eq(T::typ().to_value().to_string()))
                .stream(&self.db)
                .await?;
            Ok(a)
        }

        pub async fn search<T: DbAble>(
            &self,
            query: SearchQuery,
        ) -> anyhow::Result<SearchMatches<T>> {
            let (needle, page_size, cont) = match query {
                SearchQuery::Query { page_size, query } => (query, page_size, None),
                SearchQuery::Continuation(c) => {
                    if c.typ != T::typ() {
                        return Err(anyhow::anyhow!("continuation typ vs search typ mismatch"));
                    }
                    (c.query, c.page_size, Some(c.cont))
                }
            };

            let cont = cont
                .as_deref()
                .map(|c| c.split_once('|'))
                .flatten()
                .map(|(s, id)| -> anyhow::Result<(_, _)> {
                    let (s, id) = (s.parse::<isize>()?, id.parse::<i32>()?);
                    Ok((s, id))
                })
                .transpose()?;

            let mut tree = intrusive_collections::RBTree::new(BAdapter::<T>::new());
            let cap = page_size;

            let mut it = self.stream_models::<T>().await?;

            let mut len = 0;
            while let Some(m) = it.next().await {
                let m = m?;
                let t: T = m.parsed_assume();
                let score: isize = t
                    .haystack()
                    .into_iter()
                    .map(|h| {
                        let s = sublime_fuzzy::best_match(needle.as_str(), h)
                            .map(|m| m.score())
                            .unwrap_or(0);
                        s
                    })
                    .sum();

                if score <= 0 && !needle.is_empty() {
                    continue;
                }

                // check if this element should be in the tree
                // eject any elements if needed
                // insert a Node<T> into tree
                if cont.map(|c| c < (score, m.id)).unwrap_or(false) {
                    // ignore
                } else if len < cap {
                    tree.insert(Box::new(Node {
                        link: Default::default(),
                        val: DbItem {
                            id: m.id,
                            typ: T::typ(),
                            t,
                        },
                        score,
                    }));
                    len += 1;
                } else {
                    let mut front = tree.front_mut();
                    let node = front.get().unwrap();
                    if (node.score, node.val.id) < (score, m.id) {
                        let _ = front.remove().expect("must not fail");
                        tree.insert(Box::new(Node {
                            link: Default::default(),
                            val: DbItem {
                                id: m.id,
                                typ: T::typ(),
                                t,
                            },
                            score,
                        }));
                    }
                }
            }

            let cont = tree
                .front()
                .get()
                .map(|n| (n.score, n.val.id))
                .map(|(s, id)| s.to_string() + "|" + &id.to_string())
                .map(|cont| SearchContinuation {
                    typ: T::typ(),
                    page_size,
                    query: needle,
                    cont,
                });
            let matches = tree.into_iter().map(|n| n.val).rev().collect();

            Ok(SearchMatches {
                items: matches,
                continuation: (len == cap).then(|| cont).flatten(),
            })
        }

        pub async fn search_by_ref_id<T: DbAble>(
            &self,
            ref_id: String,
        ) -> anyhow::Result<Option<T>> {
            let e = refid::Entity::find()
                .filter(refid::Column::Typ.eq(T::typ().to_value().to_string()))
                .filter(refid::Column::Refid.eq(ref_id))
                .find_also_related(object::Entity)
                .one(&self.db)
                .await?
                .map(|(_refid, obj)| obj)
                .flatten()
                .map(|e| e.parsed_assume());
            Ok(e)
        }

        pub async fn search_many_by_ref_id<T: DbAble>(
            &self,
            ref_ids: Vec<String>,
        ) -> anyhow::Result<Vec<DbItem<T>>> {
            let mut condition = Condition::any();
            for id in ref_ids {
                condition = condition.add(refid::Column::Refid.eq(id));
            }
            let e = refid::Entity::find()
                .filter(refid::Column::Typ.eq(T::typ().to_value().to_string()))
                .filter(condition)
                .find_also_related(object::Entity)
                .all(&self.db)
                .await?
                .into_iter()
                .map(|(_refid, obj)| obj)
                .flatten()
                .map(|e| DbItem {
                    t: e.parsed_assume(),
                    id: e.id,
                    typ: T::typ(),
                })
                .collect();
            Ok(e)
        }

        pub async fn insert<T: DbAble>(&self, t: T) -> anyhow::Result<i32> {
            let am = object::ActiveModel {
                id: sea_orm::ActiveValue::NotSet,
                data: sea_orm::ActiveValue::Set(t.to_json()),
                typ: sea_orm::ActiveValue::Set(T::typ()),
            };
            let obj = object::Entity::insert(am).exec(&self.db).await?;

            let refids = t.refids().into_iter().map(String::from).collect::<HashSet<_>>();
            for rid in refids {
                let id = refid::ActiveModel {
                    refid: sea_orm::ActiveValue::Set(rid.to_string()),
                    typ: sea_orm::ActiveValue::Set(T::typ()),
                    object_id: sea_orm::ActiveValue::Set(obj.last_insert_id),
                };
                refid::Entity::insert(id).exec(&self.db).await?;
            }
            Ok(obj.last_insert_id)
        }

        pub async fn update<T: DbAble>(&self, t: DbItem<T>) -> anyhow::Result<()> {
            let am = object::ActiveModel {
                id: sea_orm::ActiveValue::Unchanged(t.id),
                data: sea_orm::ActiveValue::Set(t.t.to_json()),
                typ: sea_orm::ActiveValue::Unchanged(T::typ()),
            };
            let obj = object::Entity::update(am).exec(&self.db).await?;

            let _ = refid::Entity::delete_many()
                .filter(refid::Column::ObjectId.eq(t.id))
                .exec(&self.db)
                .await?;

            let refids =
                t.t.refids()
                    .into_iter()
                    .map(String::from)
                    .collect::<HashSet<_>>();

            for rid in refids {
                let id = refid::ActiveModel {
                    refid: sea_orm::ActiveValue::Set(rid.to_string()),
                    typ: sea_orm::ActiveValue::Set(T::typ()),
                    object_id: sea_orm::ActiveValue::Set(t.id),
                };
                refid::Entity::insert(id).exec(&self.db).await?;
            }
            Ok(())
        }

        pub async fn delete<T: DbAble>(&self, t: DbItem<T>) -> anyhow::Result<()> {
            let _ = refid::Entity::delete_many()
                .filter(refid::Column::ObjectId.eq(t.id))
                .exec(&self.db)
                .await?;

            let _ = object::Entity::delete_by_id(t.id)
                .exec(&self.db)
                .await?;
            Ok(())
        }
    }

    struct Node<T> {
        link: RBTreeLink,
        val: DbItem<T>,
        score: isize,
    }
    intrusive_adapter!(BAdapter<T> = Box<Node<T>>: Node<T> { link: RBTreeLink } where T: ?Sized + Clone);
    impl<'a, T> KeyAdapter<'a> for BAdapter<T>
    where
        T: Clone,
    {
        type Key = (isize, i32);

        fn get_key(
            &self,
            value: &'a <Self::PointerOps as intrusive_collections::PointerOps>::Value,
        ) -> Self::Key {
            (value.score, value.val.id)
        }
    }

    pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
        let mut types = String::new();
        types += &specta::ts::export::<SearchMatches<()>>(config)?;
        types += ";\n";
        types += &specta::ts::export::<DbItem<()>>(config)?;
        types += ";\n";
        types += &specta::ts::export::<Typ>(config)?;
        types += ";\n";
        types += &specta::ts::export::<SearchQuery>(config)?;
        types += ";\n";
        types += &specta::ts::export::<SearchContinuation>(config)?;
        types += ";\n";

        Ok(types)
    }

    pub async fn db_test() -> anyhow::Result<()> {
        // let db = Db { db: sea_orm::Database::connect("sqlite::memory:").await? };
        let db = Db {
            db: sea_orm::Database::connect("sqlite:./test.db?mode=rwc").await?,
        };

        // let path = "/home/issac/0Git/musimanager/db/musitracker.json";

        // let data = std::fs::read_to_string(path)?;

        // let tracker = serde_json::from_str::<crate::musimanager::Tracker>(&data)?.clean();
        // for (i, s) in tracker.songs.iter().enumerate() {
        //     db.insert(s).await?;
        // }

        let matches = db
            .search::<crate::musimanager::Song<Option<crate::musimanager::SongInfo>>>(
                SearchQuery::Query {
                    page_size: 10,
                    query: "arjit".into(),
                },
            )
            .await?;
        dbg!(&matches);
        let matches = db
            .search::<crate::musimanager::Song<Option<crate::musimanager::SongInfo>>>(
                SearchQuery::Continuation(matches.continuation.unwrap()),
            )
            .await?;
        dbg!(&matches);
        let m = db
            .search_by_ref_id::<crate::musimanager::Song<Option<crate::musimanager::SongInfo>>>(
                matches.items[0].t.key.clone(),
            )
            .await?;
        dbg!(m);

        Ok(())
    }
}
