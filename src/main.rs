use std::path::PathBuf;

use musicbrainz_rs::{
    entity::{artist::Artist, recording::Recording, release::Release, work::Work},
    Browse, Fetch, Search,
};

use anyhow::Result;

mod musiplayer;

// TODO:
// create a nix style symlinked artist/songs, album/songs, artist/albums, etc
// but store all songs in a single directory

// PLAN:
// - ui
//  - electron
//  - qt stremio thing
//  - webui zig api
// - backend
//  - database
//  - interface with musicbrainz

pub mod musimanager;
pub mod server;

mod covau_types {
    use std::path::PathBuf;

    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    #[serde(tag = "type", content = "content")]
    pub enum Source {
        File(PathBuf),
        YtId(String),
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Song {
        pub title: String,
        pub mbz_id: Option<String>,
        pub sources: Vec<Source>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Artist {
        pub name: String,
        // pub albums: Vec<AlbumId>,
    }

    pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
        let mut types = String::new();
        types += &specta::ts::export::<Source>(config)?;
        types += ";\n";
        types += &specta::ts::export::<Artist>(config)?;
        types += ";\n";
        types += &specta::ts::export::<Song>(config)?;
        types += ";\n";

        Ok(types)
    }
}

async fn api_test() -> Result<()> {
    // let r = Artist::search("query=red velvet".into()).with_releases().execute().await;
    let r = Recording::search("method=indexed&query=carole and tuesday".into())
        .execute()
        .await?;
    for e in r.entities {
        dbg!(e.title);
    }
    // let r = Work::search("method=indexed&query=dildaara".into()).execute().await;
    // let r = Release::search("query=visions".into()).execute().await;
    // let r = Release::browse().execute().await;

    // dbg!(r);

    Ok(())
}

mod webui {
    use std::{borrow::Borrow, ffi::CStr, path::PathBuf};
    use webui_rs::webui::{self, bindgen::webui_malloc};

    // returned pointer is only freed if allocated using webui_malloc
    // https://github.com/webui-dev/webui/blob/a3f3174c73b2414ea27bebb0fd62ccc0f180ad30/src/webui.c#L3150C1-L3150C23
    unsafe extern "C" fn unsafe_handle(
        name: *const std::os::raw::c_char,
        length: *mut i32,
    ) -> *const std::os::raw::c_void {
        let name = CStr::from_ptr(name);
        let res = handle(name.to_string_lossy().as_ref());
        let res = res.into_boxed_str();
        *length = res.len() as _;
        let block = webui_malloc(res.len());
        std::ptr::copy_nonoverlapping(res.as_ptr(), block as _, res.len());
        block as _
    }

    fn handle(name: &str) -> String {
        dbg!(name);
        // let data = reqwest::blocking::get(String::from("http://localhost:5173") + name).unwrap().text().unwrap();
        let data = std::fs::read_to_string(String::from("./electron/dist") + name).unwrap();
        dbg!(&data);
        data
    }

    pub async fn test_webui(url: &str) -> anyhow::Result<webui::Window> {
        let win = webui::Window::new();
        win.set_file_handler(unsafe_handle);

        // win.show("<html><head><script src=\"webui.js\"></script><head></head><body><a href=\"/test.html\"> Hello World ! </a> </body></html>");
        win.show(url);

        let a = win.run_js("console.log('hello')").data;
        dbg!(a);
        let a = win.run_js("console.log('a', b)").data;
        dbg!(a);

        tokio::task::spawn_blocking(|| {
            webui::wait();
        })
        .await?;

        Ok(win)
    }
}

mod db {
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
    }
    pub trait AutoDbAble {
        fn typ() -> Typ;
        fn haystack(&self) -> impl IntoIterator<Item = &str>;
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
    }

    #[derive(Serialize, Deserialize, Clone, Debug, Derivative, specta::Type)]
    #[derivative(PartialEq)]
    struct DemoObject {
        f1: String,
        f2: u32,
    }
    impl AutoDbAble for DemoObject {
        fn typ() -> Typ {
            Typ::DemoObject
        }
        fn haystack(&self) -> impl IntoIterator<Item = &str> {
            [self.f1.as_str()]
        }
    }

    impl AutoDbAble for crate::musimanager::Song<Option<crate::musimanager::SongInfo>> {
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
    }

    #[derive(
        Clone,
        Debug,
        PartialEq,
        Eq,
        EnumIter,
        DeriveActiveEnum,
        Serialize,
        Deserialize,
        specta::Type,
    )]
    #[sea_orm(rs_type = "i32", db_type = "Integer")]
    enum Typ {
        #[sea_orm(num_value = 0)]
        DemoObject,
        #[sea_orm(num_value = 1)]
        MusimanagerSong,
    }

    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "covau_objects")]
    pub struct Model {
        #[sea_orm(primary_key)]
        pub id: i32,
        pub data: String,
        pub typ: Typ,
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
        async fn stream_models<T: DbAble>(
            &self,
        ) -> anyhow::Result<impl futures::Stream<Item = Result<Model, DbErr>> + '_> {
            let a = Entity::find()
                .filter(Column::Typ.contains(T::typ().to_value().to_string()))
                .stream(&self.db)
                .await?;
            Ok(a)
        }

        async fn search<T: DbAble>(&self, query: SearchQuery) -> anyhow::Result<SearchMatches<T>> {
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
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct SearchMatches<T> {
        items: Vec<T>,
        continuation: Option<SearchContinuation>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct SearchContinuation {
        typ: Typ,
        page_size: u32,
        query: String,
        cont: String, // score + id
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
        dbg!(matches);

        Ok(())
    }
}

fn dump_types() -> Result<()> {
    let tsconfig = specta::ts::ExportConfiguration::default();
    let types_dir = PathBuf::from("./electron/src/types");
    let _ = std::fs::create_dir(&types_dir);
    std::fs::write(
        types_dir.join("musimanager.ts"),
        musimanager::dump_types(&tsconfig)?,
    )?;
    std::fs::write(
        types_dir.join("covau.ts"),
        covau_types::dump_types(&tsconfig)?,
    )?;
    std::fs::write(types_dir.join("server.ts"), server::dump_types(&tsconfig)?)?;
    std::fs::write(types_dir.join("db.ts"), db::dump_types(&tsconfig)?)?;

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    init_logger("./")?;

    // dbg!(ulid::Ulid::new().to_string());

    // parse_test().await?;
    // api_test().await?;

    dump_types()?;

    server::test_server().await?;

    Ok(())
}

pub fn init_logger(log_dir: impl Into<PathBuf>) -> Result<()> {
    let mut base_config = fern::Dispatch::new();

    base_config = match 3 {
        0 => {
            // Let's say we depend on something which whose "info" level messages are too
            // verbose to include in end-user output. If we don't need them,
            // let's not include them.
            base_config
                .level(log::LevelFilter::Info)
                .level_for("overly-verbose-target", log::LevelFilter::Warn)
        }
        1 => base_config
            .level(log::LevelFilter::Debug)
            .level_for("overly-verbose-target", log::LevelFilter::Info),
        2 => base_config.level(log::LevelFilter::Debug),
        _3_or_more => base_config.level(log::LevelFilter::Trace),
    };

    let log_file = log_dir.into().join("log.log");
    let _ = std::fs::remove_file(&log_file);
    let file_config = fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "[{}] [{}:{}] [{}] {}",
                record.level(),
                record.file().unwrap_or("no file"),
                record.line().unwrap_or(0),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs_f64(),
                message,
            ))
        })
        .chain(fern::log_file(&log_file)?);

    base_config.chain(file_config).apply()?;

    Ok(())
}
