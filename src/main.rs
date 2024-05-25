use std::path::PathBuf;

use musicbrainz_rs::{
    entity::{artist::Artist, recording::Recording, release::Release, work::Work},
    Browse, Fetch, Search,
};

use anyhow::Result;

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

pub mod musimanager {
    use std::collections::HashMap;

    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Tracker<S = Song, A = Album<Song>> {
        pub artists: Vec<Artist<S, A>>,
        pub auto_search_artists: Vec<Artist<S, A>>,
        pub playlists: Vec<SongProvider<S>>,
        pub queues: Vec<SongProvider<S>>,
    }

    impl<S, A> Default for Tracker<S, A> {
        fn default() -> Self {
            Tracker {
                artists: Default::default(),
                auto_search_artists: Default::default(),
                playlists: Default::default(),
                queues: Default::default(),
            }
        }
    }

    impl Tracker<Song> {
        pub fn clean(&self) -> EntityTracker {
            let mut et = EntityTracker::default();

            fn b_minus_a(a: &Vec<String>, b: &Vec<String>) -> Vec<String> {
                let mut unique = Vec::new();
                'first: for t in b.iter() {
                    for t2 in a.iter() {
                        if t == t2 || t.is_empty() {
                            continue 'first;
                        }
                    }
                    unique.push(t.clone());
                }
                unique
            }

            fn take_from(so: &mut Song, s: &Song) {
                so.artist_name = so
                    .artist_name
                    .as_ref()
                    .or(s.artist_name.as_ref())
                    .map(|s| s.to_owned());
                so.last_known_path = so
                    .last_known_path
                    .as_ref()
                    .or(s.last_known_path.as_ref())
                    .map(|s| s.to_owned());

                so.info
                    .titles
                    .extend(b_minus_a(&so.info.titles, &s.info.titles));

                so.info.duration = so.info.duration.or(s.info.duration);

                so.info.tags.extend(b_minus_a(&so.info.tags, &s.info.tags));

                if so.info.thumbnail_url.is_empty() {
                    so.info.thumbnail_url = s.info.thumbnail_url.clone();
                }
                if so.info.video_id.is_empty() {
                    so.info.video_id = s.info.video_id.clone();
                }
                if so.info.channel_id.is_empty() {
                    so.info.channel_id = s.info.channel_id.clone();
                }
                so.info.uploader_id = so
                    .info
                    .uploader_id
                    .as_ref()
                    .or(s.info.uploader_id.as_ref())
                    .map(|s| s.to_owned());
                so.info.album = so
                    .info
                    .album
                    .as_ref()
                    .or(s.info.album.as_ref())
                    .map(|s| s.to_owned());

                so.info
                    .artist_names
                    .extend(b_minus_a(&so.info.artist_names, &s.info.artist_names));
            }

            let Tracker {
                artists,
                auto_search_artists,
                playlists,
                queues,
            } = self;
            let mut songs = HashMap::<String, Song>::new();
            for a in artists {
                for s in &a.songs {
                    if let Some(so) = songs.get_mut(&s.key) {
                        take_from(so, s);
                    } else {
                        songs.insert(s.key.clone(), s.clone());
                    }
                }
                for al in a.known_albums.iter() {
                    for s in al.songs.iter() {
                        if let Some(so) = songs.get_mut(&s.key) {
                            take_from(so, s);
                        } else {
                            songs.insert(s.key.clone(), s.clone());
                        }
                    }
                }
            }
            for a in auto_search_artists {
                for s in &a.songs {
                    if s.title.contains("---") {
                        let key = "--------------";
                        songs.insert(
                            key.to_owned(),
                            Song {
                                title: s.title.clone(),
                                key: key.to_owned(),
                                artist_name: None,
                                info: Default::default(),
                                last_known_path: None,
                            },
                        );
                    } else if s.title.contains("___") {
                        let key = "______________";
                        songs.insert(
                            key.to_owned(),
                            Song {
                                title: s.title.clone(),
                                key: key.to_owned(),
                                artist_name: None,
                                info: Default::default(),
                                last_known_path: None,
                            },
                        );
                    } else if s.title.contains("===") {
                        let key = "==============";
                        songs.insert(
                            key.to_owned(),
                            Song {
                                title: s.title.clone(),
                                key: key.to_owned(),
                                artist_name: None,
                                info: Default::default(),
                                last_known_path: None,
                            },
                        );
                    } else {
                        if let Some(so) = songs.get_mut(&s.key) {
                            take_from(so, s);
                        } else {
                            songs.insert(s.key.clone(), s.clone());
                        }
                    }
                }
                for al in a.known_albums.iter() {
                    for s in al.songs.iter() {
                        if let Some(so) = songs.get_mut(&s.key) {
                            take_from(so, s);
                        } else {
                            songs.insert(s.key.clone(), s.clone());
                        }
                    }
                }
            }
            for p in playlists {
                for s in &p.data_list {
                    if let Some(so) = songs.get_mut(&s.key) {
                        take_from(so, s);
                    } else {
                        songs.insert(s.key.clone(), s.clone());
                    }
                }
            }
            for q in queues {
                for s in &q.data_list {
                    if let Some(so) = songs.get_mut(&s.key) {
                        take_from(so, s);
                    } else {
                        songs.insert(s.key.clone(), s.clone());
                    }
                }
            }
            for (_, s) in songs.iter_mut() {
                s.info.titles = s
                    .info
                    .titles
                    .iter()
                    .filter(|t| !t.is_empty())
                    .cloned()
                    .collect();
                s.info.artist_names = s
                    .info
                    .artist_names
                    .iter()
                    .filter(|t| !t.is_empty())
                    .cloned()
                    .collect();
                s.info.album = s.info.album.as_ref().filter(|a| !a.is_empty()).cloned();
                s.info.uploader_id = s
                    .info
                    .uploader_id
                    .as_ref()
                    .filter(|a| !a.is_empty())
                    .cloned();
            }

            for (_, s) in songs.into_iter() {
                et.songs.push(Song {
                    title: s.title,
                    key: s.key,
                    artist_name: s.artist_name,
                    info: Some(s.info).filter(|i| !i.video_id.is_empty()),
                    last_known_path: s.last_known_path,
                });
            }

            let mut m_albums = HashMap::new();
            for a in artists.iter() {
                for al in a.known_albums.iter() {
                    m_albums.insert(al.browse_id.clone(), al.clone());
                }
            }
            for a in auto_search_artists.iter() {
                for al in a.known_albums.iter() {
                    if let Some(alo) = m_albums.get_mut(&al.browse_id) {
                        alo.playlist_id = alo
                            .playlist_id
                            .as_ref()
                            .or(al.playlist_id.as_ref())
                            .cloned();

                        let mut songs = HashMap::new();
                        for s in alo.songs.iter() {
                            songs.insert(s.key.clone(), s.clone());
                        }
                        for s in al.songs.iter() {
                            if !songs.contains_key(&s.key) {
                                songs.insert(s.key.clone(), s.clone());
                            }
                        }
                        alo.songs = songs.into_values().collect();

                        alo.artist_keys
                            .extend(b_minus_a(&alo.artist_keys, &al.artist_keys));

                        if alo.artist_name.is_empty() {
                            alo.artist_name = al.artist_name.clone();
                        }
                        if alo.name.is_empty() {
                            alo.name = al.name.clone();
                        }
                    } else {
                        m_albums.insert(al.browse_id.clone(), al.clone());
                    }
                }
            }
            et.albums = m_albums
                .into_values()
                .map(|al| Album {
                    name: al.name,
                    browse_id: al.browse_id,
                    playlist_id: al.playlist_id,
                    songs: al.songs.into_iter().map(|s| SongId(s.key)).collect(),
                    artist_name: al.artist_name,
                    artist_keys: al.artist_keys,
                })
                .collect();

            let mut m_artists = HashMap::new();
            for a in artists.iter() {
                m_artists.insert(a.name.clone(), a.clone());
            }
            for a in auto_search_artists {
                if let Some(ao) = m_artists.get_mut(&a.name) {
                    ao.keys.extend(b_minus_a(&ao.keys, &a.keys));
                    ao.search_keywords
                        .extend(b_minus_a(&ao.search_keywords, &a.search_keywords));
                    ao.non_keywords
                        .extend(b_minus_a(&ao.non_keywords, &a.non_keywords));
                    ao.keywords.extend(b_minus_a(&ao.keywords, &a.keywords));

                    let mut albums = HashMap::new();
                    for al in ao.known_albums.iter() {
                        albums.insert(al.browse_id.clone(), al.clone());
                    }
                    for al in a.known_albums.iter() {
                        if !albums.contains_key(&al.browse_id) {
                            albums.insert(al.browse_id.clone(), al.clone());
                        }
                    }
                    ao.known_albums = albums.into_values().collect();

                    ao.unexplored_songs = a.songs.clone();
                    ao.unexplored_songs.iter_mut().for_each(|s| {
                        if s.title.contains("---") {
                            let key = "--------------";
                            *s = Song {
                                title: key.to_owned(),
                                key: key.to_owned(),
                                artist_name: None,
                                info: Default::default(),
                                last_known_path: None,
                            };
                        } else if s.title.contains("___") {
                            let key = "______________";
                            *s = Song {
                                title: key.to_owned(),
                                key: key.to_owned(),
                                artist_name: None,
                                info: Default::default(),
                                last_known_path: None,
                            };
                        } else if s.title.contains("===") {
                            let key = "==============";
                            *s = Song {
                                title: key.to_owned(),
                                key: key.to_owned(),
                                artist_name: None,
                                info: Default::default(),
                                last_known_path: None,
                            };
                        }
                    });
                } else {
                    let mut a = a.clone();
                    a.unexplored_songs = a.songs;
                    a.songs = Vec::new();

                    m_artists.insert(a.name.clone(), a.clone());
                }
            }
            et.artists = m_artists
                .into_iter()
                .map(|(_, a)| Artist {
                    name: a.name,
                    keys: a.keys,
                    check_stat: a.check_stat,
                    ignore_no_songs: a.ignore_no_songs,
                    name_confirmation_status: a.name_confirmation_status,
                    songs: a.songs.into_iter().map(|s| SongId(s.key)).collect(),
                    unexplored_songs: a
                        .unexplored_songs
                        .into_iter()
                        .map(|s| SongId(s.key))
                        .collect(),
                    known_albums: a
                        .known_albums
                        .into_iter()
                        .map(|al| AlbumId(al.browse_id))
                        .collect(),
                    keywords: a.keywords,
                    non_keywords: a.non_keywords,
                    search_keywords: a.search_keywords,
                    last_auto_search: a.last_auto_search,
                })
                .collect();

            et
        }
    }

    #[derive(Serialize, Deserialize, Clone, Debug, Default, specta::Type)]
    pub struct EntityTracker {
        pub songs: Vec<Song<Option<SongInfo>>>,
        pub albums: Vec<Album<SongId>>,

        pub artists: Vec<Artist<SongId, AlbumId>>,
        pub playlists: Vec<SongProvider<SongId>>,
        pub queues: Vec<SongProvider<SongId>>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct SongId(pub String);

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct AlbumId(pub String);

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct SongProvider<S> {
        pub name: String,
        pub data_list: Vec<S>,
        pub current_index: u32,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Album<S> {
        pub name: String,
        pub browse_id: String,
        pub playlist_id: Option<String>,
        pub songs: Vec<S>,
        pub artist_name: String,
        pub artist_keys: Vec<String>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Artist<S, A> {
        pub name: String,
        pub keys: Vec<String>,
        pub check_stat: bool,      // # TODO: not needed?
        pub ignore_no_songs: bool, // # wont be removed from db even if no songs in it (only tracking for new albums)
        pub name_confirmation_status: bool,
        pub songs: Vec<S>,
        pub known_albums: Vec<A>, // # to track what albums the user has listened to
        pub keywords: Vec<String>, // # keywords for sort
        pub non_keywords: Vec<String>, // # keywords/keys to specifically ignore
        pub search_keywords: Vec<String>,
        pub last_auto_search: Option<u32>,

        // not in python implementation
        #[serde(default = "Vec::new")]
        pub unexplored_songs: Vec<S>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub struct Song<I = SongInfo> {
        pub title: String, // NOTE: technically optional from python
        pub key: String,   // NOTE: technically optional from python
        pub artist_name: Option<String>,
        pub info: I,
        pub last_known_path: Option<String>,
    }

    #[derive(Serialize, Deserialize, Clone, Debug, Default, specta::Type)]
    pub struct SongInfo {
        pub titles: Vec<String>, // track > alt_title > title
        pub video_id: String,
        pub duration: Option<f32>, // # TODO: no need?
        pub tags: Vec<String>,
        pub thumbnail_url: String,
        pub album: Option<String>,
        pub artist_names: Vec<String>, // artist > uploader > creator > channel
        pub channel_id: String,
        pub uploader_id: Option<String>,
    }

    pub fn dump_types() -> anyhow::Result<()> {
        let mut types = String::new();

        let config = specta::ts::ExportConfiguration::default();

        types += &specta::ts::export::<SongInfo>(&config)?;
        types += ";\n";
        types += &specta::ts::export::<Song>(&config)?;
        types += ";\n";
        types += &specta::ts::export::<SongId>(&config)?;
        types += ";\n";
        types += &specta::ts::export::<AlbumId>(&config)?;
        types += ";\n";
        types += &specta::ts::export::<Artist<(), ()>>(&config)?;
        types += ";\n";
        types += &specta::ts::export::<Album<()>>(&config)?;
        types += ";\n";
        types += &specta::ts::export::<SongProvider<()>>(&config)?;
        types += ";\n";
        types += &specta::ts::export::<EntityTracker>(&config)?;
        types += ";\n";
        types += &specta::ts::export::<Tracker>(&config)?;
        types += ";\n";

        println!("{}", types);

        Ok(())
    }

    async fn parse_test() -> anyhow::Result<()> {
        let path = "/home/issac/0Git/musimanager/db/musitracker.json";

        let data = std::fs::read_to_string(path)?;

        let parsed = serde_json::from_str::<Tracker>(&data)?;

        // for a in parsed.artists.iter() {
        //     for s in a
        //         .songs
        //         .iter()
        //         .chain(parsed.playlists.iter().flat_map(|e| e.data_list.iter()))
        //     {}
        // }

        let dis = parsed.clean();
        dbg!(dis);
        // dbg!(parsed
        //     .artists
        //     .iter()
        //     .map(|a| a.known_albums.clone())
        //     .collect::<Vec<_>>());

        Ok(())
    }
}

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

    pub fn dump_types() -> anyhow::Result<()> {
        let mut types = String::new();

        let config = specta::ts::ExportConfiguration::default();

        types += &specta::ts::export::<Source>(&config)?;
        types += ";\n";
        types += &specta::ts::export::<Artist>(&config)?;
        types += ";\n";
        types += &specta::ts::export::<Song>(&config)?;
        types += ";\n";

        println!("{}", types);

        Ok(())
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

    pub async fn test_webui() -> anyhow::Result<()> {
        let win = webui::Window::new();
        win.set_file_handler(unsafe_handle);

        // win.show("<html><head><script src=\"webui.js\"></script><head></head><body><a href=\"/test.html\"> Hello World ! </a> </body></html>");
        // win.show_browser("https://covau.netlify.app/#/vibe/lotus", webui::WebUIBrowser::Chromium);
        // win.show_browser("https://youtube.com", webui::WebUIBrowser::Chromium);
        // win.run_js("/webui.js");
        win.show("http://localhost:5173");
        // win.show("/");

        let a = win.run_js("console.log('hello')").data;
        dbg!(a);
        let a = win.run_js("console.log('a', b)").data;
        dbg!(a);

        tokio::task::spawn_blocking(|| {
            webui::wait();
        })
        .await?;

        Ok(())
    }
}

mod server {
    use anyhow::Context;
    use futures::{FutureExt, StreamExt};
    use serde::{Deserialize, Serialize};
    use std::net::Ipv4Addr;
    use std::{collections::HashMap, convert::Infallible, sync::Arc};
    use tokio::sync::{mpsc, Mutex};
    use tokio_stream::wrappers::UnboundedReceiverStream;
    use ulid::Ulid;
    use warp::ws::WebSocket;
    use warp::{reject::Rejection, reply::Reply, ws::Ws};
    use warp::{ws, Filter};

    #[derive(Debug, Clone)]
    pub struct Client {
        pub user_id: String,
        pub sender: mpsc::UnboundedSender<std::result::Result<ws::Message, warp::Error>>,
    }

    pub type Clients = Arc<Mutex<HashMap<String, Client>>>;

    #[derive(Debug)]
    struct CustomReject(anyhow::Error);

    impl warp::reject::Reject for CustomReject {}

    pub(crate) fn custom_reject(error: impl Into<anyhow::Error>) -> warp::Rejection {
        warp::reject::custom(CustomReject(error.into()))
    }

    pub async fn start(ip_addr: Ipv4Addr, port: u16) {
        let clients: Clients = Arc::new(Mutex::new(HashMap::new()));
        let client = std::sync::Arc::new(tokio::sync::Mutex::new(reqwest::Client::new()));

        let ws_route = warp::path("ws")
            .and(warp::ws())
            .and(warp::any().map(move || clients.clone()))
            .then(|ws: Ws, clients: Clients| async move {
                ws.on_upgrade(move |ws| client_connection(ws, clients))
            });
        let ws_route = ws_route.with(warp::cors().allow_any_origin());

        let c = client.clone();
        let cors_proxy = warp::path("fetch")
            // .and(warp::post())
            .and(warp::body::bytes())
            .and(warp::any().map(move || c.clone()))
            .and_then(
                |fetch: bytes::Bytes, client: Arc<Mutex<reqwest::Client>>| async move {
                    dbg!(String::from_utf8_lossy(fetch.clone().to_vec().as_slice()));
                    let fetch = fetch.to_vec();
                    if fetch.is_empty() { // OOF: for preflight requests. idk what else to do
                        return warp::http::Response::builder()
                            .body(warp::hyper::Body::empty())
                            .map_err(custom_reject);
                    }
                    let fetch = serde_json::from_slice::<FetchRequest>(fetch.as_ref())
                        .map_err(custom_reject)?;
                    dbg!(&fetch);
                    let headers: Vec<(String, String)> =
                        serde_json::from_str(&fetch.headers).map_err(custom_reject)?;
                    let c = client.lock().await;
                    let url = reqwest::Url::parse(&fetch.url).map_err(custom_reject)?;
                    let mut url = c.request(
                        reqwest::Method::from_bytes(fetch.method.as_bytes())
                            .map_err(custom_reject)?,
                        url,
                    );
                    if let Some(body) = fetch.body {
                        url = url.body(body);
                    }
                    for (k, v) in headers {
                        url = url.header(k, v);
                    }
                    let res = c
                        .execute(url.build().map_err(custom_reject)?)
                        .await
                        .map_err(custom_reject)?;
                    let mut wres = warp::http::Response::builder();
                    for (k, v) in res.headers().iter() {
                        wres = wres.header(k, v);
                    }
                    let status = res.status();
                    let body = warp::hyper::Body::wrap_stream(res.bytes().into_stream());
                    wres.status(status).body(body).map_err(custom_reject)
                },
            );
        // .map(|mut s: warp::http::Response<warp::hyper::Body>| {s.headers_mut().clear(); s});
        let cors_proxy = cors_proxy.with(warp::cors().allow_any_origin());

        println!("Starting server at {}:{}", ip_addr, port);

        let c = client.clone();
        let redirect = warp::any()
            .and(warp::any().map(move || c.clone()))
            .and(warp::method())
            .and(warp::path::tail())
            .and(warp::header::headers_cloned())
            .and(warp::body::bytes())
            .and_then(
                |client: Arc<Mutex<reqwest::Client>>,
                 m: warp::http::Method,
                 p: warp::path::Tail,
                 h: warp::http::HeaderMap,
                 b: bytes::Bytes| async move {
                    let c = client.lock().await;
                    let url = String::from("http://localhost:5173/") + p.as_str();
                    dbg!(&url);
                    let mut req = c.request(m, url);
                    for (k, v) in h.iter() {
                        req = req.header(k, v);
                    }
                    req = req.body(b);
                    let res = c
                        .execute(req.build().map_err(custom_reject)?)
                        .await
                        .map_err(custom_reject)?;
                    let mut wres = warp::http::Response::builder();
                    for (k, v) in res.headers().iter() {
                        wres = wres.header(k, v);
                    }
                    let status = res.status();
                    let body = warp::hyper::Body::wrap_stream(res.bytes().into_stream());
                    wres.status(status).body(body).map_err(custom_reject)
                    // Ok::<_, warp::Rejection>(wres)
                },
            );

        let all = ws_route.or(cors_proxy).or(redirect);
        // let all = redirect;

        warp::serve(all).run((ip_addr, port)).await;
    }

    pub async fn client_connection(ws: WebSocket, clients: Clients) {
        let (client_ws_sender, mut client_ws_receiver) = ws.split();
        let (client_sender, client_receiver) = mpsc::unbounded_channel();
        let client_receiver = UnboundedReceiverStream::new(client_receiver);

        tokio::task::spawn(client_receiver.forward(client_ws_sender).map(|result| {
            if let Err(e) = result {
                eprintln!("Failed to send message using websocket - {}", e.to_string());
            }
        }));

        let ulid: String = Ulid::new().to_string();
        let new_client: Client = Client {
            user_id: ulid.clone(),
            sender: client_sender,
        };
        clients.lock().await.insert(ulid.clone(), new_client);

        while let Some(result) = client_ws_receiver.next().await {
            let msg = match result {
                Ok(msg) => msg,
                Err(e) => {
                    eprintln!(
                        "Failed to receive message using websocket - {}",
                        e.to_string()
                    );
                    break;
                }
            };

            println!("Received message from {}: {:?}", &ulid, msg);
            match client_msg(&ulid, msg, &clients).await {
                Ok(_) => (),
                Err(e) => {
                    eprintln!("Error: {}", e);
                }
            }
        }

        clients.lock().await.remove(&ulid);
        println!("Websocket disconnected: {}", &ulid);
    }

    #[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
    #[serde(tag = "type", content = "content")]
    pub enum Message {
        Ping,
    }

    #[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
    pub struct FetchRequest {
        url: String,
        #[serde(default = "Default::default")]
        body: Option<String>,
        // headers: HashMap<String, String>,
        headers: String,
        method: String,
    }

    async fn client_msg(user_id: &str, msg: ws::Message, clients: &Clients) -> anyhow::Result<()> {
        let message = msg.to_str().ok().context("message was not a string")?;
        let message = serde_json::from_str::<Message>(message)?;

        let clients = clients.lock().await;
        let client = clients.get(user_id).context("Client not found")?;

        match message {
            Message::Ping => {
                let _ = client.sender.send(Ok(ws::Message::text("pong")));
            }
        }

        Ok(())
    }

    pub async fn test_server() -> anyhow::Result<()> {
        start("127.0.0.1".parse().unwrap(), 10010).await;

        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    init_logger("./")?;

    // test_webui().await?;

    // dbg!(ulid::Ulid::new().to_string());

    // parse_test().await?;
    // api_test().await?;

    // musimanager::dump_types()?;
    // covau_types::dump_types()?;

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
