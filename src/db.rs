use derivative::Derivative;
use intrusive_collections::{intrusive_adapter, KeyAdapter, RBTreeLink};
use sea_orm::DeriveEntityModel;
use sea_orm::{entity::prelude::*, Schema};
use serde::{Deserialize, Serialize};
use tokio_stream::StreamExt;

pub trait DbAble: Serialize + for<'de> Deserialize<'de> + std::fmt::Debug + Clone {
    fn to_json(&self) -> String;
    fn typ() -> Typ;
    fn haystack(&self) -> impl IntoIterator<Item = &str>;
    fn ref_id(&self) -> Option<String>;
}
pub trait AutoDbAble {
    fn typ() -> Typ;
    fn haystack(&self) -> impl IntoIterator<Item = &str>;
    fn ref_id(&self) -> Option<String> {
        None
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
    fn ref_id(&self) -> Option<String> {
        <Self as AutoDbAble>::ref_id(self)
    }
}

mod musimanager {
    use super::*;
    use crate::musimanager::*;

    impl AutoDbAble for Song<Option<SongInfo>> {
        fn typ() -> Typ {
            Typ::MusimanagerSong
        }

        fn haystack(&self) -> impl IntoIterator<Item = &str> {
            let mut hs = vec![self.title.as_str()];

            self.artist_name.as_deref().map(|a| {
                hs.push(a);
            });

            hs
        }

        fn ref_id(&self) -> Option<String> {
            Some(self.key.clone())
        }
    }
    impl AutoDbAble for Album<SongId> {
        fn typ() -> Typ {
            Typ::MusimanagerAlbum
        }

        fn haystack(&self) -> impl IntoIterator<Item = &str> {
            let mut hs = vec![self.name.as_str()];

            // self.artist_name.as_deref().map(|a| {
            //     hs.push(a);
            // });

            hs
        }

        fn ref_id(&self) -> Option<String> {
            Some(self.browse_id.clone())
        }
    }
    impl AutoDbAble for Artist<SongId, AlbumId> {
        fn typ() -> Typ {
            Typ::MusimanagerArtist
        }

        fn haystack(&self) -> impl IntoIterator<Item = &str> {
            let mut hs = vec![self.name.as_str()];

            // self.artist_name.as_deref().map(|a| {
            //     hs.push(a);
            // });

            hs
        }
    }
    impl AutoDbAble for Playlist<SongId> {
        fn typ() -> Typ {
            Typ::MusimanagerPlaylist
        }

        fn haystack(&self) -> impl IntoIterator<Item = &str> {
            [self.0.name.as_str()]
        }
    }
    impl AutoDbAble for Queue<SongId> {
        fn typ() -> Typ {
            Typ::MusimanagerQueue
        }

        fn haystack(&self) -> impl IntoIterator<Item = &str> {
            [self.0.name.as_str()]
        }
    }
}

#[derive(
    Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize, specta::Type,
)]
#[sea_orm(rs_type = "i32", db_type = "Integer")]
pub enum Typ {
    #[sea_orm(num_value = 1)]
    MusimanagerSong,
    #[sea_orm(num_value = 2)]
    MusimanagerAlbum,
    #[sea_orm(num_value = 3)]
    MusimanagerArtist,
    #[sea_orm(num_value = 4)]
    MusimanagerPlaylist,
    #[sea_orm(num_value = 5)]
    MusimanagerQueue,
}

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "covau_objects")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = true)]
    pub id: i32,
    pub data: String,
    pub typ: Typ,
    /// any other kind of id that we might need to match on
    /// for example SongId -> Song
    pub ref_id: Option<String>,
}
impl Model {
    fn parsed_assume<T: for<'de> Deserialize<'de>>(&self) -> T {
        let t: T = serde_json::from_str(&self.data).expect("parsing Model json failed");
        t
    }
    fn parsed<T: DbAble>(&self) -> anyhow::Result<T> {
        if T::typ() != self.typ {
            return Err(anyhow::anyhow!("model type mismatch"));
        }
        let t: T = serde_json::from_str(&self.data)?;
        Ok(t)
    }
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

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
        let s = builder.build(&schema.create_table_from_entity(Entity));
        let _ = self.db.execute(s).await?;
        Ok(())
    }

    pub async fn stream_models<T: DbAble>(
        &self,
    ) -> anyhow::Result<impl futures::Stream<Item = Result<Model, DbErr>> + '_> {
        let a = Entity::find()
            .filter(Column::Typ.eq(T::typ().to_value().to_string()))
            .stream(&self.db)
            .await?;
        Ok(a)
    }

    pub async fn search<T: DbAble>(&self, query: SearchQuery) -> anyhow::Result<SearchMatches<T>> {
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
                    val: t,
                    id: m.id,
                    score,
                }));
                len += 1;
            } else {
                let mut front = tree.front_mut();
                let node = front.get().unwrap();
                if (node.score, node.id) < (score, m.id) {
                    let _ = front.remove().expect("must not fail");
                    tree.insert(Box::new(Node {
                        link: Default::default(),
                        val: t,
                        id: m.id,
                        score,
                    }));
                }
            }
        }

        let cont = tree
            .front()
            .get()
            .map(|n| (n.score, n.id))
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

    pub async fn search_by_ref_id<T: DbAble>(&self, ref_id: String) -> anyhow::Result<Option<T>> {
        let e = Entity::find()
            .filter(Column::Typ.eq(T::typ().to_value().to_string()))
            .filter(Column::RefId.eq(ref_id))
            .one(&self.db)
            .await?
            .map(|e| e.parsed_assume());
        Ok(e)
    }

    pub async fn insert<T: DbAble>(&self, t: &T) -> anyhow::Result<()> {
        let am = ActiveModel {
            id: sea_orm::ActiveValue::NotSet,
            data: sea_orm::ActiveValue::Set(t.to_json()),
            typ: sea_orm::ActiveValue::Set(T::typ()),
            ref_id: sea_orm::ActiveValue::Set(t.ref_id()),
        };
        Entity::insert(am).exec(&self.db).await?;
        Ok(())
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct SearchMatches<T> {
    pub items: Vec<T>,
    pub continuation: Option<SearchContinuation>,
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct SearchContinuation {
    pub typ: Typ,
    pub page_size: u32,
    pub query: String,
    pub cont: String, // score + id
}
#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
#[serde(tag = "type", content = "content")]
pub enum SearchQuery {
    Query { page_size: u32, query: String },
    Continuation(SearchContinuation),
}

struct Node<T> {
    link: RBTreeLink,
    val: T,
    id: i32,
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
        (value.score, value.id)
    }
}

pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
    let mut types = String::new();
    types += &specta::ts::export::<SearchMatches<()>>(config)?;
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
            matches.items[0].key.clone(),
        )
        .await?;
    dbg!(m);

    Ok(())
}
