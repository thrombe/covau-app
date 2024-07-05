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
    pub metadata: DbMetadata,
    pub id: i32,
    pub typ: Typ,
    pub t: T,
}

// these fields don't always mean something. but i can't bother with metadata specific to specific items
#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
#[cfg_attr(
    feature = "wasmdeps",
    derive(tsify_next::Tsify),
    tsify(into_wasm_abi, from_wasm_abi)
)]
pub struct DbMetadata {
    pub done: bool,
    pub likes: u32,
    pub dislikes: u32,
    pub interactions: u32,
    pub update_counter: u32, // increment when updated to prevent overwrites
    #[serde(with = "serde_with_string")]
    pub added_ts: u64,
    #[serde(with = "serde_with_string")]
    pub updated_ts: u64,
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
impl DbMetadata {
    pub fn new() -> Self {
        let ts = Db::timestamp();
        Self {
            likes: 0,
            dislikes: 0,
            interactions: 0,
            done: false,
            update_counter: 0,
            added_ts: ts,
            updated_ts: ts,
        }
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(&self).expect("won't fail")
    }
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
    use std::collections::{HashMap, HashSet};

    use anyhow::Context;
    use intrusive_collections::{intrusive_adapter, KeyAdapter, RBTreeLink};
    use sea_orm::{entity::prelude::*, Schema};
    use sea_orm::{Condition, DeriveEntityModel, QuerySelect, SelectColumns};
    use sea_orm::{RelationTrait, TransactionTrait};
    use tokio_stream::StreamExt;

    use super::*;

    pub type DbId = i32;

    #[async_trait::async_trait]
    pub trait DbAble:
        Serialize + for<'de> Deserialize<'de> + std::fmt::Debug + Clone + Sync + Send
    {
        fn to_json(&self) -> String;
        fn typ() -> Typ;
        fn haystack(&self) -> impl IntoIterator<Item = String>;
        fn refids(&self) -> impl IntoIterator<Item = String>;
        fn links(&self) -> impl IntoIterator<Item = Link>;

        async fn get_by_refid<C: ConnectionTrait>(
            &self,
            conn: &C,
        ) -> anyhow::Result<Option<DbItem<Self>>> {
            let mut condition = Condition::any();
            for id in self.refids() {
                condition = condition.add(refid::Column::Refid.eq(id));
            }

            let e = refid::Entity::find()
                .filter(refid::Column::Typ.eq(Self::typ()))
                .filter(condition)
                .find_also_related(object::Entity)
                .one(conn)
                .await?
                .map(|(_refid, obj)| obj)
                .flatten()
                .map(|e| DbItem {
                    metadata: e.parse_assume_metadata(),
                    t: e.parsed_assume(),
                    id: e.id,
                    typ: Self::typ(),
                });
            Ok(e)
        }

        async fn insert<C>(&self, conn: &C) -> anyhow::Result<i32>
        where
            C: ConnectionTrait,
        {
            let am = object::ActiveModel {
                id: sea_orm::ActiveValue::NotSet,
                data: sea_orm::ActiveValue::Set(self.to_json()),
                typ: sea_orm::ActiveValue::Set(Self::typ()),
                metadata: sea_orm::ActiveValue::Set(DbMetadata::new().to_json()),
            };
            let obj = object::Entity::insert(am).exec(conn).await?;

            let refids = self
                .refids()
                .into_iter()
                .map(String::from)
                .collect::<HashSet<_>>();
            for rid in refids {
                let id = refid::ActiveModel {
                    refid: sea_orm::ActiveValue::Set(rid.to_string()),
                    typ: sea_orm::ActiveValue::Set(Self::typ()),
                    object_id: sea_orm::ActiveValue::Set(obj.last_insert_id),
                };
                refid::Entity::insert(id).exec(conn).await?;
            }
            Ok(obj.last_insert_id)
        }

        async fn get<C: ConnectionTrait>(
            conn: &C,
            id: DbId,
        ) -> anyhow::Result<Option<DbItem<Self>>> {
            let m = object::Entity::find_by_id(id).one(conn).await?;
            let mdata = m.map(|m| DbItem {
                metadata: m.parse_assume_metadata(),
                t: m.parsed_assume(),
                id: m.id,
                typ: m.typ,
            });
            Ok(mdata)
        }

        async fn update_mdata<C: ConnectionTrait>(
            conn: &C,
            id: DbId,
            mut mdata: DbMetadata,
        ) -> anyhow::Result<DbMetadata> {
            let old = Self::get(conn, id).await?;
            if !old
                .map(|m| m.metadata.update_counter == mdata.update_counter)
                .unwrap_or(false)
            {
                return Err(anyhow::anyhow!("invalid update (mdata)"));
            }

            mdata.update_counter += 1;
            mdata.updated_ts = Db::timestamp();

            let am = object::ActiveModel {
                id: sea_orm::ActiveValue::Unchanged(id),
                data: sea_orm::ActiveValue::NotSet,
                typ: sea_orm::ActiveValue::Unchanged(Self::typ()),
                metadata: sea_orm::ActiveValue::Set(mdata.to_json()),
            };
            let obj = object::Entity::update(am).exec(conn).await?;
            Ok(mdata)
        }
    }

    impl<T: DbAble> DbItem<T> {
        pub async fn update<C: ConnectionTrait>(&self, conn: &C) -> anyhow::Result<DbMetadata> {
            let old = T::get(conn, self.id).await?;
            if !old
                .map(|m| m.metadata.update_counter == self.metadata.update_counter)
                .unwrap_or(false)
            {
                return Err(anyhow::anyhow!("invalid update (mdata)"));
            }

            let mut mdata = self.metadata.clone();
            mdata.update_counter += 1;
            mdata.updated_ts = Db::timestamp();

            let am = object::ActiveModel {
                id: sea_orm::ActiveValue::Unchanged(self.id),
                data: sea_orm::ActiveValue::Set(self.t.to_json()),
                typ: sea_orm::ActiveValue::Unchanged(T::typ()),
                metadata: sea_orm::ActiveValue::Set(mdata.to_json()),
            };
            let obj = object::Entity::update(am).exec(conn).await?;

            let _ = refid::Entity::delete_many()
                .filter(refid::Column::ObjectId.eq(self.id))
                .exec(conn)
                .await?;

            let refids = self
                .t
                .refids()
                .into_iter()
                .map(String::from)
                .collect::<HashSet<_>>();

            for rid in refids {
                let id = refid::ActiveModel {
                    refid: sea_orm::ActiveValue::Set(rid.to_string()),
                    typ: sea_orm::ActiveValue::Set(T::typ()),
                    object_id: sea_orm::ActiveValue::Set(self.id),
                };
                refid::Entity::insert(id).exec(conn).await?;
            }
            Ok(mdata)
        }

        pub async fn delete<C: ConnectionTrait>(&self, conn: &C) -> anyhow::Result<()> {
            let _ = refid::Entity::delete_many()
                .filter(refid::Column::ObjectId.eq(self.id))
                .exec(conn)
                .await?;

            let _ = object::Entity::delete_by_id(self.id).exec(conn).await?;
            Ok(())
        }
    }

    pub trait Linked<To> {}

    pub trait AutoDbAble {
        fn typ() -> Typ;
        fn haystack(&self) -> impl IntoIterator<Item = String>;
        fn refids(&self) -> impl IntoIterator<Item = String> {
            []
        }
        fn links(&self) -> impl IntoIterator<Item = Link> {
            []
        }
    }
    impl<T> DbAble for T
    where
        T: Serialize
            + for<'de> Deserialize<'de>
            + std::fmt::Debug
            + Clone
            + AutoDbAble
            + Sync
            + Send,
    {
        fn to_json(&self) -> String {
            serde_json::to_string(self).expect("won't fail")
        }
        fn typ() -> Typ {
            <Self as AutoDbAble>::typ()
        }
        fn haystack(&self) -> impl IntoIterator<Item = String> {
            <Self as AutoDbAble>::haystack(self)
        }
        fn refids(&self) -> impl IntoIterator<Item = String> {
            <Self as AutoDbAble>::refids(self)
        }
        fn links(&self) -> impl IntoIterator<Item = Link> {
            <Self as AutoDbAble>::links(self)
        }
    }

    mod covau_types {
        use std::collections::HashSet;

        use super::{AutoDbAble, Link, Linked, Typ};
        use crate::covau_types::*;

        impl Linked<crate::yt::song_tube::Song> for Song {}
        impl Linked<crate::mbz::RecordingWithInfo> for Song {}
        impl AutoDbAble for Song {
            fn typ() -> Typ {
                Typ::Song
            }

            fn haystack(&self) -> impl IntoIterator<Item = String> {
                let mut h = self.artists.iter().map(String::from).collect::<Vec<_>>();
                h.push(self.title.clone());
                h
            }

            fn refids(&self) -> impl IntoIterator<Item = String> {
                let mut hs = vec![];

                for id in self.info_sources.iter() {
                    match id {
                        InfoSource::YtId(id) => {
                            hs.push(id.to_owned());
                        }
                        InfoSource::MbzId(id) => {
                            hs.push(id.to_owned());
                        }
                    }
                }
                for id in self.play_sources.iter() {
                    match id {
                        PlaySource::File(id) => {
                            hs.push(id.to_owned());
                        }
                        PlaySource::YtId(id) => {
                            hs.push(id.to_owned());
                        }
                    }
                }

                hs
            }

            fn links(&self) -> impl IntoIterator<Item = Link> {
                let mut links = vec![];

                let set: HashSet<_> = self.refids().into_iter().collect();
                for from_id in set.into_iter() {
                    for id in self.info_sources.iter() {
                        match id {
                            InfoSource::YtId(id) => {
                                links.push(Link {
                                    from_refid: from_id.clone(),
                                    from_typ: Self::typ(),
                                    to_refid: id.to_owned(),
                                    to_typ: crate::yt::song_tube::Song::typ(),
                                });
                            }
                            InfoSource::MbzId(id) => {
                                // hs.push(id.to_owned());
                            }
                        }
                    }
                }

                links
            }
        }

        impl AutoDbAble for Playlist {
            fn typ() -> Typ {
                Typ::Playlist
            }

            fn haystack(&self) -> impl IntoIterator<Item = String> {
                [self.title.clone()]
            }
        }

        impl AutoDbAble for Queue {
            fn typ() -> Typ {
                Typ::Queue
            }

            fn haystack(&self) -> impl IntoIterator<Item = String> {
                [self.0.queue.title.clone()]
            }
        }

        // impl Linked<Updater, crate::mbz::Artist> {}
        use crate::musimanager as mm;
        impl Linked<mm::Artist<mm::VideoId, mm::AlbumId>> for Updater {}
        impl Linked<crate::yt::song_tube::Artist> for Updater {}
        impl AutoDbAble for Updater {
            fn typ() -> Typ {
                Typ::Updater
            }

            fn haystack(&self) -> impl IntoIterator<Item = String> {
                [self.title.clone()]
            }

            fn refids(&self) -> impl IntoIterator<Item = String> {
                let mut rids = vec![];
                match &self.source {
                    UpdateSource::Mbz { artist_id, .. } => {
                        rids.push(artist_id.to_owned());
                    }
                    UpdateSource::MusimanagerSearch { artist_keys, .. } => {
                        // OOF: it's all messed up
                        // rids.extend(artist_keys.iter().map(String::from));
                    }
                    UpdateSource::SongTubeSearch { artist_keys, .. } => {
                        rids.extend(artist_keys.iter().map(String::from));
                    }
                }
                rids
            }

            fn links(&self) -> impl IntoIterator<Item = Link> {
                let mut links = vec![];

                for from in self.refids() {
                    match &self.source {
                        UpdateSource::Mbz { artist_id, .. } => {
                            // links.push(artist_id.to_owned());
                        }
                        UpdateSource::MusimanagerSearch { artist_keys, .. } => {
                            links.extend(artist_keys.iter().map(String::from).map(|to| Link {
                                from_refid: from.clone(),
                                from_typ: Self::typ(),
                                to_refid: to,
                                to_typ: mm::Artist::<mm::VideoId, mm::AlbumId>::typ(),
                            }));
                        }
                        UpdateSource::SongTubeSearch { artist_keys, .. } => {
                            links.extend(artist_keys.iter().map(String::from).map(|to| Link {
                                from_refid: from.clone(),
                                from_typ: Self::typ(),
                                to_refid: to,
                                to_typ: crate::yt::song_tube::Artist::typ(),
                            }));
                        }
                    }
                }
                links
            }
        }
    }

    mod yt {
        use super::{db, AutoDbAble, Link, Linked, Typ};
        use crate::yt::song_tube::*;

        impl Linked<Album> for Song {}
        impl Linked<Artist> for Song {}
        impl AutoDbAble for Song {
            fn typ() -> db::Typ {
                db::Typ::StSong
            }

            fn haystack(&self) -> impl IntoIterator<Item = String> {
                let mut hs = vec![];

                self.title.as_deref().map(|a| {
                    hs.push(a.to_owned());
                });

                self.authors
                    .iter()
                    .map(|a| a.name.clone())
                    .for_each(|n| hs.push(n));

                self.album
                    .as_ref()
                    .map(|a| a.name.clone())
                    .flatten()
                    .map(|n| hs.push(n));

                hs
            }

            fn refids(&self) -> impl IntoIterator<Item = String> {
                [self.id.to_owned()]
            }

            fn links(&self) -> impl IntoIterator<Item = Link> {
                let mut links = vec![];
                for from in self.refids() {
                    for id in self.authors.iter().filter_map(|a| a.channel_id.as_ref()) {
                        links.push(Link {
                            from_refid: from.clone(),
                            from_typ: <Self as AutoDbAble>::typ(),
                            to_refid: id.to_owned(),
                            to_typ: <Artist as AutoDbAble>::typ(),
                        });
                    }
                }
                for from in self.refids() {
                    for a in self.album.iter() {
                        links.push(Link {
                            from_refid: from.clone(),
                            from_typ: <Self as AutoDbAble>::typ(),
                            to_refid: a.id.clone(),
                            to_typ: <Album as AutoDbAble>::typ(),
                        });
                    }
                }
                links
            }
        }

        impl Linked<Artist> for Album {}
        impl AutoDbAble for Album {
            fn typ() -> db::Typ {
                db::Typ::StAlbum
            }

            fn haystack(&self) -> impl IntoIterator<Item = String> {
                let mut hs = vec![];

                self.title.as_deref().map(|a| {
                    hs.push(a.to_owned());
                });

                self.author
                    .as_ref()
                    .map(|a| a.name.clone())
                    .map(|n| hs.push(n));

                hs
            }

            fn refids(&self) -> impl IntoIterator<Item = String> {
                [self.id.clone()]
            }

            fn links(&self) -> impl IntoIterator<Item = Link> {
                let mut links = vec![];
                for from in self.refids() {
                    for to in self.author.iter().filter_map(|a| a.channel_id.as_ref()) {
                        links.push(Link {
                            from_refid: from.clone(),
                            from_typ: <Self as AutoDbAble>::typ(),
                            to_refid: to.to_owned(),
                            to_typ: <Artist as AutoDbAble>::typ(),
                        });
                    }
                }
                links
            }
        }

        impl AutoDbAble for Playlist {
            fn typ() -> db::Typ {
                db::Typ::StPlaylist
            }

            fn haystack(&self) -> impl IntoIterator<Item = String> {
                let mut hs = vec![];

                self.title.as_deref().map(|a| {
                    hs.push(a.to_owned());
                });

                self.author
                    .as_ref()
                    .map(|a| a.name.clone())
                    .map(|n| hs.push(n));

                hs
            }

            fn refids(&self) -> impl IntoIterator<Item = String> {
                [self.id.clone()]
            }
        }

        impl AutoDbAble for Artist {
            fn typ() -> db::Typ {
                db::Typ::StArtist
            }

            fn haystack(&self) -> impl IntoIterator<Item = String> {
                let mut hs = vec![];

                self.name.as_deref().map(|a| {
                    hs.push(a.to_owned());
                });

                hs
            }

            fn refids(&self) -> impl IntoIterator<Item = String> {
                [self.id.clone()]
            }
        }
    }

    mod musimanager {
        use super::{AutoDbAble, Link, Linked, Typ};
        use crate::musimanager::*;

        // impl Linked<Album<VideoId>> for Song<Option<SongInfo>> {}
        impl Linked<Artist<VideoId, AlbumId>> for Song<Option<SongInfo>> {}
        impl AutoDbAble for Song<Option<SongInfo>> {
            fn typ() -> Typ {
                Typ::MmSong
            }

            fn haystack(&self) -> impl IntoIterator<Item = String> {
                let mut hs = vec![self.title.clone()];

                self.artist_name.as_deref().map(|a| {
                    hs.push(a.to_owned());
                });

                hs
            }

            fn refids(&self) -> impl IntoIterator<Item = String> {
                [self.key.clone()]
            }

            fn links(&self) -> impl IntoIterator<Item = Link> {
                let mut links = vec![];
                for from in self.refids() {
                    for i in self.info.iter() {
                        links.push(Link {
                            from_refid: from.clone(),
                            from_typ: Self::typ(),
                            to_refid: i.channel_id.clone(),
                            to_typ: Artist::<VideoId, AlbumId>::typ(),
                        });
                    }
                }
                links
            }
        }
        impl Linked<Artist<VideoId, AlbumId>> for Album<VideoId> {}
        impl AutoDbAble for Album<VideoId> {
            fn typ() -> Typ {
                Typ::MmAlbum
            }

            fn haystack(&self) -> impl IntoIterator<Item = String> {
                [self.name.clone(), self.artist_name.clone()]
            }

            fn refids(&self) -> impl IntoIterator<Item = String> {
                [self.browse_id.clone()]
            }

            fn links(&self) -> impl IntoIterator<Item = Link> {
                let mut links = vec![];
                for from in self.refids() {
                    for i in self.artist_keys.iter() {
                        links.push(Link {
                            from_refid: from.clone(),
                            from_typ: Self::typ(),
                            to_refid: i.clone(),
                            to_typ: Artist::<VideoId, AlbumId>::typ(),
                        });
                    }
                }
                links
            }
        }
        impl AutoDbAble for Artist<VideoId, AlbumId> {
            fn typ() -> Typ {
                Typ::MmArtist
            }

            fn haystack(&self) -> impl IntoIterator<Item = String> {
                [self.name.clone()]
            }

            // fn refids(&self) -> impl IntoIterator<Item = String> {
            //     self.keys.iter().map(String::from).collect::<Vec<_>>()
            // }
        }
        impl AutoDbAble for Playlist<VideoId> {
            fn typ() -> Typ {
                Typ::MmPlaylist
            }

            fn haystack(&self) -> impl IntoIterator<Item = String> {
                [self.0.name.clone()]
            }
        }
        impl AutoDbAble for Queue<VideoId> {
            fn typ() -> Typ {
                Typ::MmQueue
            }

            fn haystack(&self) -> impl IntoIterator<Item = String> {
                [self.0.name.clone()]
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
            pub metadata: String,
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
            pub fn parse_assume_metadata<T: for<'de> Deserialize<'de>>(&self) -> T {
                let t: T = serde_json::from_str(&self.metadata)
                    .expect("parsing Model metadata json failed");
                t
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
        /// for example VideoId -> Song

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
    pub use link::Model as Link;
    mod link {
        use super::*;

        // - objecs just add self_refid, self_type, link_refid.
        //  - so song: videoid, albumid, playlistid
        //  -    album: albumid, artistid
        //  -    artist: artistid
        //  - then you can do queries like
        //    gimme 'Song' linked to this artistid
        //    or gimme 'YtSong' linked to this Song's id

        #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
        #[sea_orm(table_name = "links")]
        pub struct Model {
            #[sea_orm(primary_key)]
            pub from_refid: String,
            #[sea_orm(primary_key)]
            pub from_typ: Typ,
            #[sea_orm(primary_key)]
            pub to_refid: String,
            #[sea_orm(primary_key)]
            pub to_typ: Typ,
        }

        #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
        pub enum Relation {
            // #[sea_orm(
            //     belongs_to = "super::refid::Entity",
            //     from = "Column::FromRefid",
            //     to = "super::refid::Column::refid"
            // )]
            // From,
            // #[sea_orm(
            //     belongs_to = "super::refid::Entity",
            //     from = "Column::FromRefid",
            //     to = "super::refid::Column::refid"
            // )]
            // To,
        }

        impl ActiveModelBehavior for ActiveModel {}
    }

    pub type TransactionId = u32;

    #[derive(Clone)]
    pub struct Db {
        pub db: sea_orm::DatabaseConnection,
        pub transaction_id: std::sync::Arc<std::sync::atomic::AtomicU32>,
        pub transactions:
            std::sync::Arc<tokio::sync::Mutex<HashMap<u32, sea_orm::DatabaseTransaction>>>,
    }
    impl Db {
        pub async fn new(path: impl AsRef<str>) -> anyhow::Result<Self> {
            let mut opts = sea_orm::ConnectOptions::new(path.as_ref());

            // a transaction blocks 1 connection completely
            // a writer transaction blocks all writers (sqlite can't do multiple concurrent writers)
            // - [Transaction](https://sqlite.org/lang_transaction.html)
            opts.max_connections(10);
            opts.max_lifetime(std::time::Duration::from_secs_f32(60.0 * 10.0));
            let db = sea_orm::Database::connect(opts).await?;

            // enable wal so writers do not block reads
            // - [Write-Ahead Logging](https://www.sqlite.org/wal.html)
            db.execute_unprepared("PRAGMA journal_mode = wal;").await?;

            let db = Db {
                db,
                transaction_id: std::sync::Arc::new(0.into()),
                transactions: std::sync::Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            };
            Ok(db)
        }

        pub async fn begin(&self) -> anyhow::Result<TransactionId> {
            let txn = self.db.begin().await?;
            let id = self
                .transaction_id
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let mut txns = self.transactions.lock().await;
            txns.insert(id, txn)
                .is_none()
                .then_some(())
                .expect("new id is generated");
            Ok(id)
        }

        pub async fn commit(&self, id: TransactionId) -> anyhow::Result<()> {
            let mut txns = self.transactions.lock().await;
            let txn = txns.remove(&id).context("Transaction not found")?;
            txn.commit().await?;
            Ok(())
        }

        pub async fn rollback(&self, id: TransactionId) -> anyhow::Result<()> {
            let mut txns = self.transactions.lock().await;
            let txn = txns.remove(&id).context("Transaction not found")?;
            txn.rollback().await?;
            Ok(())
        }

        pub async fn init_tables(&self) -> anyhow::Result<()> {
            let builder = self.db.get_database_backend();
            let schema = Schema::new(builder);

            let s = builder.build(&schema.create_table_from_entity(object::Entity));
            let _ = self.db.execute(s).await?;
            let s = builder.build(
                &sea_orm::sea_query::Index::create()
                    .name("id_index")
                    .table(object::Entity)
                    .col(object::Column::Id)
                    .to_owned(),
            );
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

            let s = builder.build(&schema.create_table_from_entity(link::Entity));
            let _ = self.db.execute(s).await?;
            let s = builder.build(
                &sea_orm::sea_query::Index::create()
                    .name("from_link_index")
                    .table(link::Entity)
                    .col(link::Column::FromRefid)
                    .to_owned(),
            );
            let _ = self.db.execute(s).await?;
            let s = builder.build(
                &sea_orm::sea_query::Index::create()
                    .name("to_link_index")
                    .table(link::Entity)
                    .col(link::Column::ToRefid)
                    .to_owned(),
            );
            let _ = self.db.execute(s).await?;

            Ok(())
        }

        pub async fn init_musimanager_data(
            &self,
            musimanager_db_path: impl AsRef<std::path::Path>,
        ) -> anyhow::Result<()> {
            let path = musimanager_db_path.as_ref();

            let data = std::fs::read_to_string(path)?;
            let txn = self.db.begin().await?;

            let tracker = serde_json::from_str::<crate::musimanager::Tracker>(&data)?.clean();
            for s in tracker.songs.iter() {
                s.insert(&txn).await?;
            }
            println!("songs added");
            for a in tracker.artists.iter() {
                a.insert(&txn).await?;
            }
            println!("artists added");
            for a in tracker.albums.iter() {
                a.insert(&txn).await?;
            }
            println!("albums added");
            for p in tracker.playlists.iter() {
                p.insert(&txn).await?;
            }
            println!("playlists added");
            for q in tracker.queues.iter() {
                q.insert(&txn).await?;
            }
            println!("queues added");

            let ts = Db::timestamp();
            for a in tracker.artists.iter() {
                if !a.known_albums.is_empty() || !a.unexplored_songs.is_empty() {
                    let u = crate::covau_types::Updater {
                        title: a.name.clone(),
                        source: crate::covau_types::UpdateSource::MusimanagerSearch {
                            search_words: a.search_keywords.clone(),
                            artist_keys: a.keys.clone(),
                            non_search_words: a.non_keywords.clone(),
                            known_albums: a
                                .known_albums
                                .iter()
                                .map(|e| crate::covau_types::UpdateItem {
                                    done: false,
                                    points: 0,
                                    item: e.clone(),
                                    added_ts: ts,
                                })
                                .collect(),
                            songs: crate::covau_types::ListenQueue {
                                queue: a
                                    .unexplored_songs
                                    .iter()
                                    .map(|e| crate::covau_types::UpdateItem {
                                        done: false,
                                        points: 0,
                                        item: e.clone(),
                                        added_ts: ts,
                                    })
                                    .collect(),
                                current_index: None,
                            },
                        },
                        last_update_ts: a.last_auto_search.unwrap_or(0) as u64,
                        enabled: a.last_auto_search.is_some(),
                    };
                    u.insert(&txn).await?;
                } else {
                    assert_eq!(a.last_auto_search.is_none(), true);
                }
            }
            println!("updaters added");

            txn.commit().await?;

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
                        let s = sublime_fuzzy::best_match(needle.as_str(), &h)
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
                            metadata: m.parse_assume_metadata(),
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
                                metadata: m.parse_assume_metadata(),
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

        pub async fn search_linked_from<From, To>(
            &self,
            from: Vec<String>,
        ) -> anyhow::Result<Vec<DbItem<To>>>
        where
            From: DbAble + Linked<To>,
            To: DbAble,
        {
            let mut condition = Condition::any();
            for id in from {
                condition = condition.add(link::Column::FromRefid.eq(id));
            }
            let links = link::Entity::find()
                .filter(link::Column::FromTyp.eq(From::typ()))
                .filter(link::Column::ToTyp.eq(To::typ()))
                .filter(condition)
                .all(&self.db)
                .await?
                .into_iter()
                .collect::<Vec<_>>();
            let items = links.into_iter().map(|e| e.to_refid).collect();

            let items = self.search_many_by_ref_id(items).await?;

            Ok(items)
        }

        pub async fn search_linked_to<From, To>(
            &self,
            to: Vec<String>,
        ) -> anyhow::Result<Vec<DbItem<From>>>
        where
            From: DbAble + Linked<To>,
            To: DbAble,
        {
            let mut condition = Condition::any();
            for id in to {
                condition = condition.add(link::Column::ToRefid.eq(id));
            }
            let links = link::Entity::find()
                .filter(link::Column::FromTyp.eq(From::typ()))
                .filter(link::Column::ToTyp.eq(To::typ()))
                .filter(condition)
                .all(&self.db)
                .await?
                .into_iter()
                .collect::<Vec<_>>();
            let items = links.into_iter().map(|e| e.from_refid).collect();

            let items = self.search_many_by_ref_id(items).await?;

            Ok(items)
        }

        pub async fn search_untyped_by_id(
            &self,
            id: DbId,
        ) -> anyhow::Result<Option<DbItem<String>>> {
            let e = object::Entity::find()
                .filter(object::Column::Id.eq(id))
                .one(&self.db)
                .await?
                .map(|e| DbItem {
                    metadata: e.parse_assume_metadata(),
                    t: e.data,
                    id: e.id,
                    typ: e.typ,
                });
            Ok(e)
        }

        pub async fn search_many_untyped_by_id(
            &self,
            ids: Vec<DbId>,
        ) -> anyhow::Result<Vec<DbItem<String>>> {
            let mut condition = Condition::any();
            for id in ids {
                condition = condition.add(object::Column::Id.eq(id));
            }
            let e = object::Entity::find()
                .filter(condition)
                .all(&self.db)
                .await?
                .into_iter()
                .map(|e| DbItem {
                    metadata: e.parse_assume_metadata(),
                    t: e.data,
                    id: e.id,
                    typ: e.typ,
                })
                .collect();
            Ok(e)
        }

        pub async fn search_by_id<T: DbAble>(&self, id: DbId) -> anyhow::Result<Option<DbItem<T>>> {
            let e = object::Entity::find()
                .filter(object::Column::Typ.eq(T::typ()))
                .filter(object::Column::Id.eq(id))
                .one(&self.db)
                .await?
                .map(|e| DbItem {
                    metadata: e.parse_assume_metadata(),
                    t: e.parsed_assume(),
                    id: e.id,
                    typ: T::typ(),
                });
            Ok(e)
        }

        pub async fn search_many_by_id<T: DbAble>(
            &self,
            ids: Vec<DbId>,
        ) -> anyhow::Result<Vec<DbItem<T>>> {
            let mut condition = Condition::any();
            for id in ids {
                condition = condition.add(object::Column::Id.eq(id));
            }
            let e = object::Entity::find()
                .filter(object::Column::Typ.eq(T::typ()))
                .filter(condition)
                .all(&self.db)
                .await?
                .into_iter()
                .map(|e| DbItem {
                    metadata: e.parse_assume_metadata(),
                    t: e.parsed_assume(),
                    id: e.id,
                    typ: T::typ(),
                })
                .collect();
            Ok(e)
        }

        pub async fn search_by_ref_id<T: DbAble>(
            &self,
            ref_id: String,
        ) -> anyhow::Result<Option<DbItem<T>>> {
            let e = refid::Entity::find()
                .filter(refid::Column::Typ.eq(T::typ()))
                .filter(refid::Column::Refid.eq(ref_id))
                .find_also_related(object::Entity)
                .one(&self.db)
                .await?
                .map(|(_refid, obj)| obj)
                .flatten()
                .map(|e| DbItem {
                    metadata: e.parse_assume_metadata(),
                    t: e.parsed_assume(),
                    id: e.id,
                    typ: T::typ(),
                });
            Ok(e)
        }

        pub async fn search_many_by_ref_id<T: DbAble>(
            &self,
            ref_ids: Vec<String>,
        ) -> anyhow::Result<Vec<DbItem<T>>> {
            // TODO: crash on building query if this condition has a lot of items (1000 ish)
            // - maybe create a temporary table for refids and join on it
            // - maybe just use a rust hashmap (slow tho :/)
            let mut condition = Condition::any();
            for id in ref_ids {
                condition = condition.add(refid::Column::Refid.eq(id));
            }
            let e = refid::Entity::find()
                .filter(refid::Column::Typ.eq(T::typ()))
                .filter(condition)
                .find_also_related(object::Entity)
                .all(&self.db)
                .await?
                .into_iter()
                .map(|(_refid, obj)| obj)
                .flatten()
                .map(|e| DbItem {
                    metadata: e.parse_assume_metadata(),
                    t: e.parsed_assume(),
                    id: e.id,
                    typ: T::typ(),
                })
                .collect();
            Ok(e)
        }

        pub fn timestamp() -> u64 {
            let secs = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("unix epoch is the beginning of everything")
                .as_secs();
            secs
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
        types += &specta::ts::export::<DbMetadata>(config)?;
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
        let db = Db::new("sqlite:./test.db?mode=rwc").await?;

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
