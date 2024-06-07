use anyhow::Context;
use futures::{FutureExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{mpsc, Mutex};
use tokio::time::Duration;
use tokio_stream::wrappers::{ReceiverStream, UnboundedReceiverStream};
use ulid::Ulid;
use warp::filters::BoxedFilter;
use warp::ws::WebSocket;
use warp::{reply::Reply, ws::Ws};
use warp::{ws, Filter};

use crate::db::{Db, DbAble};
use crate::mbz::{self, IdSearch, PagedSearch};
use crate::musiplayer::Player;

#[derive(Debug, Clone)]
pub struct Client {
    pub user_id: String,
    pub sender: mpsc::UnboundedSender<std::result::Result<ws::Message, warp::Error>>,
}

pub type Clients = Arc<Mutex<HashMap<String, Client>>>;

// [Rejection and anyhow](https://github.com/seanmonstar/warp/issues/307#issuecomment-570833388)
#[derive(Debug)]
struct CustomReject(anyhow::Error);

impl warp::reject::Reject for CustomReject {}

pub(crate) fn custom_reject(error: impl Into<anyhow::Error>) -> warp::Rejection {
    warp::reject::custom(CustomReject(error.into()))
}

async fn player_command_handler(
    msg: ws::Message,
    player: &Arc<Mutex<Player>>,
    tx: tokio::sync::mpsc::Sender<Result<PlayerMessage, warp::Error>>,
) -> anyhow::Result<()> {
    let message = msg.to_str().ok().context("message was not a string")?;
    let message = serde_json::from_str::<PlayerCommand>(message)?;

    let mut p = player.lock().await;
    let timeout = Duration::from_millis(500);
    match message {
        PlayerCommand::Play(url) => {
            p.play(url.clone())?;
            tx.send_timeout(Ok(PlayerMessage::Playing(url)), timeout)
                .await?;

            let player = player.clone();
            let _: tokio::task::JoinHandle<anyhow::Result<()>> = tokio::task::spawn(async move {
                for _ in 0..50 {
                    tokio::time::sleep(timeout).await;
                    let mut p = player.lock().await;
                    let dur = p.duration()?;
                    if dur > 0.5 && dur < 60.0 * 60.0 * 24.0 * 30.0 {
                        tx.send_timeout(Ok(PlayerMessage::Duration(dur)), timeout)
                            .await?;
                        break;
                    }
                }
                Ok(())
            });
        }
        PlayerCommand::Pause => {
            p.pause()?;
            tx.send_timeout(Ok(PlayerMessage::Paused), timeout).await?;
        }
        PlayerCommand::Unpause => {
            p.unpause()?;
            tx.send_timeout(Ok(PlayerMessage::Unpaused), timeout)
                .await?;
        }
        PlayerCommand::SeekBy(t) => {
            p.seek_by(t)?;
        }
        PlayerCommand::SeekToPerc(perc) => {
            p.seek_to_perc(perc)?;
        }
        PlayerCommand::GetVolume => {
            tx.send_timeout(Ok(PlayerMessage::Volume(p.get_volume()?)), timeout)
                .await?;
        }
        PlayerCommand::SetVolume(v) => {
            p.set_volume(v)?;
            tokio::time::sleep(timeout).await;
            tx.send_timeout(Ok(PlayerMessage::Volume(p.get_volume()?)), timeout)
                .await?;
        }
        PlayerCommand::GetDuration => {
            tx.send_timeout(Ok(PlayerMessage::Duration(p.duration()?)), timeout)
                .await?;
        }
        PlayerCommand::Mute => {
            p.mute()?;
            tokio::time::sleep(timeout).await;
            tx.send_timeout(Ok(PlayerMessage::Mute(p.is_muted()?)), timeout)
                .await?;
        }
        PlayerCommand::Unmute => {
            p.unmute()?;
            tokio::time::sleep(timeout).await;
            tx.send_timeout(Ok(PlayerMessage::Mute(p.is_muted()?)), timeout)
                .await?;
        }
        PlayerCommand::IsMuted => {
            tx.send_timeout(Ok(PlayerMessage::Mute(p.is_muted()?)), timeout)
                .await?;
        }
    }
    Ok(())
}
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type", content = "content")]
pub enum PlayerCommand {
    Pause,
    Unpause,
    Play(String),
    SeekBy(f64),
    SeekToPerc(f64),
    Mute,
    Unmute,
    IsMuted,
    GetVolume,
    SetVolume(f64),
    GetDuration,
}
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type", content = "content")]
pub enum PlayerMessage {
    Paused,
    Unpaused,
    Finished,
    Playing(String),
    ProgressPerc(f64),
    Volume(f64),
    Duration(f64),
    Mute(bool),
}

fn player_route() -> BoxedFilter<(impl Reply,)> {
    let player = Arc::new(Mutex::new(Player::new().expect("could not start player")));

    let route = warp::path("player")
        .and(warp::path::end())
        .and(warp::ws())
        .and(warp::any().map(move || player.clone()))
        .then(|ws: Ws, player: Arc<Mutex<Player>>| async move {
            ws.on_upgrade(move |ws| async move {
                let (wstx, mut wsrx) = ws.split();

                let (tx, rx) = mpsc::channel::<Result<PlayerMessage, warp::Error>>(100);
                let rx = ReceiverStream::new(rx);

                let _ = tokio::task::spawn(
                    rx.map(|e| {
                        let e = e?;
                        let e = ws::Message::text(serde_json::to_string(&e).unwrap());
                        Ok(e)
                    })
                    .forward(wstx)
                    .map(|result| {
                        if let Err(e) = result {
                            eprintln!("Failed to send message using websocket - {}", e.to_string());
                        }
                    }),
                );
                let pl = player.clone();
                let txc = tx.clone();
                let _: tokio::task::JoinHandle<anyhow::Result<()>> =
                    tokio::task::spawn(async move {
                        let timeout = Duration::from_millis(300);
                        let mut finished = false;
                        loop {
                            tokio::time::sleep(timeout).await;
                            let mut p = pl.lock().await;
                            let prog = p.progress()?;

                            if 1.0 - prog < 0.0001 {
                                if !finished {
                                    finished = true;
                                    txc.send_timeout(Ok(PlayerMessage::ProgressPerc(1.0)), timeout)
                                        .await?;
                                    txc.send_timeout(Ok(PlayerMessage::Finished), timeout)
                                        .await?;
                                }
                            } else {
                                finished = false;
                                txc.send_timeout(Ok(PlayerMessage::ProgressPerc(prog)), timeout)
                                    .await?;
                            }
                        }
                    });

                while let Some(msg) = wsrx.next().await {
                    match msg {
                        Ok(msg) => match player_command_handler(msg, &player, tx.clone()).await {
                            Ok(_) => (),
                            Err(e) => {
                                eprintln!("Error: {}", e);
                            }
                        },
                        Err(e) => {
                            eprintln!("Error: {}", e);
                        }
                    }
                }
            })
        });
    let route = route.with(warp::cors().allow_any_origin());

    route.boxed()
}

fn client_ws_route() -> BoxedFilter<(impl Reply,)> {
    let clients: Clients = Arc::new(Mutex::new(HashMap::new()));

    let ws_route = warp::path("ws")
        .and(warp::path::end())
        .and(warp::ws())
        .and(warp::any().map(move || clients.clone()))
        .then(|ws: Ws, clients: Clients| async move {
            ws.on_upgrade(move |ws| client_connection(ws, clients))
        });
    let ws_route = ws_route.with(warp::cors().allow_any_origin());
    ws_route.boxed()
}

fn cors_proxy_route(c: Arc<Mutex<reqwest::Client>>) -> BoxedFilter<(impl Reply,)> {
    let cors_proxy = warp::path("fetch")
        .and(warp::path::end())
        // .and(warp::post())
        .and(warp::body::bytes())
        .and(warp::any().map(move || c.clone()))
        .and_then(
            |fetch: bytes::Bytes, client: Arc<Mutex<reqwest::Client>>| async move {
                let fetch = fetch.to_vec();
                if fetch.is_empty() {
                    // OOF: for preflight requests. idk what else to do
                    return warp::http::Response::builder()
                        .body(warp::hyper::Body::empty())
                        .map_err(custom_reject);
                }
                let fetch = serde_json::from_slice::<FetchRequest>(fetch.as_ref())
                    .map_err(custom_reject)?;
                let headers: Vec<(String, String)> =
                    serde_json::from_str(&fetch.headers).map_err(custom_reject)?;
                let c = client.lock().await;
                let url = reqwest::Url::parse(&fetch.url).map_err(custom_reject)?;
                let mut url = c.request(
                    reqwest::Method::from_bytes(fetch.method.as_bytes()).map_err(custom_reject)?,
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
    let cors_proxy = cors_proxy.with(warp::cors().allow_any_origin());
    cors_proxy.boxed()
}

fn redirect_route(c: Arc<Mutex<reqwest::Client>>) -> BoxedFilter<(impl Reply,)> {
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
    redirect.boxed()
}

fn db_search_route<T: DbAble + Send>(
    db: Arc<Db>,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Arc<Db>, query: crate::db::SearchQuery| async move {
            let res = db.search::<T>(query).await.map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

fn db_search_by_refid_route<T: DbAble + Send>(
    db: Arc<Db>,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path("refid"))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Arc<Db>, query: Vec<String>| async move {
            let res = db
                .search_many_by_ref_id::<T>(query)
                .await
                .map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

fn paged_search<T: PagedSearch + Serialize + Send>(
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path::end())
        .and(warp::body::json())
        .and_then(|query: mbz::SearchQuery| async move {
            let res = T::search(query).await.map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

fn id_search<T: IdSearch + Serialize + Send>(path: &'static str) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path("id"))
        .and(warp::path::end())
        .and(warp::body::json())
        .and_then(|query: String| async move {
            let res = T::get(&query).await.map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

#[derive(rust_embed::Embed)]
#[folder = "electron/dist/"]
pub struct Asset;

fn embedded_asset_route() -> BoxedFilter<(impl Reply,)> {
    async fn serve_impl(path: &str) -> Result<impl Reply, warp::Rejection> {
        let asset = Asset::get(path).ok_or_else(warp::reject::not_found)?;
        let mime = mime_guess::from_path(path).first_or_octet_stream();

        let mut res = warp::reply::Response::new(asset.data.into());
        res.headers_mut().insert(
            "content-type",
            warp::http::HeaderValue::from_str(mime.as_ref()).unwrap(),
        );
        Ok::<_, warp::Rejection>(res)
    }

    let index_route = warp::any().and(warp::path::end()).and_then(|| async move {
        let path = "index.html";
        serve_impl(path).await
    });

    let route =
        warp::any()
            .and(warp::path::tail())
            .and_then(|t: warp::filters::path::Tail| async move {
                let path = t.as_str();
                serve_impl(path).await
            });

    index_route.or(route).boxed()
}

pub async fn start(ip_addr: Ipv4Addr, port: u16) {
    let client = Arc::new(Mutex::new(reqwest::Client::new()));
    let db = Arc::new(
        Db::new("sqlite:./test.db?mode=rwc")
            .await
            .expect("cannot connect to database"),
    );
    // db.init_tables().await.expect("could not init database");

    let musimanager_search_routes = {
        use crate::musimanager::*;

        warp::path("musimanager").and(
            db_search_route::<Song<Option<SongInfo>>>(db.clone(), "songs")
                .or(db_search_by_refid_route::<Song<Option<SongInfo>>>(
                    db.clone(),
                    "songs",
                ))
                .or(db_search_route::<Album<SongId>>(db.clone(), "albums"))
                .or(db_search_by_refid_route::<Album<SongId>>(
                    db.clone(),
                    "albums",
                ))
                .or(db_search_route::<Artist<SongId, AlbumId>>(
                    db.clone(),
                    "artists",
                ))
                .or(db_search_route::<Playlist<SongId>>(db.clone(), "playlists"))
                .or(db_search_route::<Queue<SongId>>(db.clone(), "queues")),
        )
    };

    let mbz_search_routes = {
        use crate::mbz::*;

        warp::path("mbz").and(
            paged_search::<ReleaseWithInfo>("releases")
                .or(id_search::<ReleaseWithInfo>("releases"))
                .or(paged_search::<ReleaseGroupWithInfo>("release_groups"))
                .or(id_search::<ReleaseGroupWithInfo>("release_groups"))
                .or(paged_search::<Artist>("artists"))
                .or(id_search::<Artist>("artists"))
                .or(id_search::<WithUrlRels<Artist>>("artist_with_urls"))
                .or(paged_search::<Recording>("recordings"))
                .or(id_search::<Recording>("recordings")),
        )
    };

    let options_route = warp::any().and(warp::options()).map(warp::reply).with(
        warp::cors()
            .allow_any_origin()
            .allow_header("content-type")
            .allow_methods(["POST", "GET"]),
    );

    let all = client_ws_route()
        .or(player_route())
        .or(cors_proxy_route(client.clone()))
        .or(musimanager_search_routes)
        .or(mbz_search_routes)
        .or(options_route);
    // let all = all.or(redirect_route(client.clone()));
    let all = all.or(embedded_asset_route());

    println!("Starting server at {}:{}", ip_addr, port);

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

pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
    let mut types = String::new();
    types += &specta::ts::export::<Message>(config)?;
    types += ";\n";
    types += &specta::ts::export::<PlayerCommand>(config)?;
    types += ";\n";
    types += &specta::ts::export::<PlayerMessage>(config)?;
    types += ";\n";
    types += &specta::ts::export::<FetchRequest>(config)?;
    types += ";\n";

    Ok(types)
}

pub async fn test_server() -> anyhow::Result<()> {
    start("127.0.0.1".parse().unwrap(), 10010).await;

    Ok(())
}
