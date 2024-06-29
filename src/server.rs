use anyhow::Context;
use futures::{FutureExt, SinkExt, StreamExt};
use sea_orm::TransactionTrait;
use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;
use std::ops::Deref;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{mpsc, oneshot, Mutex};
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
use crate::yt::YtiRequest;

// [Rejection and anyhow](https://github.com/seanmonstar/warp/issues/307#issuecomment-570833388)
#[derive(Debug)]
struct CustomReject(anyhow::Error);

impl warp::reject::Reject for CustomReject {}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
struct ErrorMessage {
    message: String,
    stack_trace: String,
}

pub(crate) fn custom_reject(error: impl Into<anyhow::Error>) -> warp::Rejection {
    warp::reject::custom(CustomReject(error.into()))
}

async fn player_command_handler(
    msg: ws::Message,
    player: &Arc<Mutex<Player>>,
    tx: tokio::sync::mpsc::Sender<PlayerMessage>,
) -> anyhow::Result<()> {
    let message = msg.to_str().ok().context("message was not a string")?;
    let message = serde_json::from_str::<PlayerCommand>(message)?;

    let mut p = player.lock().await;
    let timeout = Duration::from_millis(500);
    match message {
        PlayerCommand::Play(url) => {
            p.play(url.clone())?;
            tx.send_timeout(PlayerMessage::Playing(url), timeout)
                .await?;

            let player = player.clone();
            let _: tokio::task::JoinHandle<()> = tokio::task::spawn(async move {
                for _ in 0..50 {
                    tokio::time::sleep(timeout).await;
                    let mut p = player.lock().await;
                    let dur = match p.duration() {
                        Ok(d) => d,
                        Err(e) => {
                            tx.send_timeout(PlayerMessage::Error(e.to_string()), timeout)
                                .await
                                .unwrap();
                            continue;
                        }
                    };
                    if dur > 0.5 && dur < 60.0 * 60.0 * 24.0 * 30.0 {
                        tx.send_timeout(PlayerMessage::Duration(dur), timeout)
                            .await
                            .unwrap();
                        break;
                    }
                }
            });
        }
        PlayerCommand::Pause => {
            p.pause()?;
            tx.send_timeout(PlayerMessage::Paused, timeout).await?;
        }
        PlayerCommand::Unpause => {
            p.unpause()?;
            tx.send_timeout(PlayerMessage::Unpaused, timeout).await?;
        }
        PlayerCommand::SeekBy(t) => {
            p.seek_by(t)?;
        }
        PlayerCommand::SeekToPerc(perc) => {
            p.seek_to_perc(perc)?;
        }
        PlayerCommand::GetVolume => {
            tx.send_timeout(PlayerMessage::Volume(p.get_volume()?), timeout)
                .await?;
        }
        PlayerCommand::SetVolume(v) => {
            p.set_volume(v)?;
            tokio::time::sleep(timeout).await;
            tx.send_timeout(PlayerMessage::Volume(p.get_volume()?), timeout)
                .await?;
        }
        PlayerCommand::GetDuration => {
            tx.send_timeout(PlayerMessage::Duration(p.duration()?), timeout)
                .await?;
        }
        PlayerCommand::Mute => {
            p.mute()?;
            tokio::time::sleep(timeout).await;
            tx.send_timeout(PlayerMessage::Mute(p.is_muted()?), timeout)
                .await?;
        }
        PlayerCommand::Unmute => {
            p.unmute()?;
            tokio::time::sleep(timeout).await;
            tx.send_timeout(PlayerMessage::Mute(p.is_muted()?), timeout)
                .await?;
        }
        PlayerCommand::IsMuted => {
            tx.send_timeout(PlayerMessage::Mute(p.is_muted()?), timeout)
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
    Error(String),
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

                let (tx, rx) = mpsc::channel::<PlayerMessage>(100);
                let rx = ReceiverStream::new(rx);

                let j2 = tokio::task::spawn(
                    rx.map(|e| {
                        let e = ws::Message::text(serde_json::to_string(&e).unwrap());
                        Ok::<_, warp::Error>(e)
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
                let j: tokio::task::JoinHandle<()> = tokio::task::spawn(async move {
                    let timeout = Duration::from_millis(300);
                    let mut finished = false;
                    // no crashing, ending the loop
                    // don't worry about timeout errors ig :/
                    loop {
                        tokio::time::sleep(timeout).await;
                        let mut p = pl.lock().await;
                        let prog = match p.progress() {
                            Ok(p) => p,
                            Err(e) => {
                                let _ = txc
                                    .send_timeout(PlayerMessage::Error(e.to_string()), timeout)
                                    .await;
                                continue;
                            }
                        };

                        if 1.0 - prog < 0.0001 {
                            if !finished {
                                finished = true;
                                let _ = txc
                                    .send_timeout(PlayerMessage::ProgressPerc(1.0), timeout)
                                    .await;
                                let _ = txc.send_timeout(PlayerMessage::Finished, timeout).await;
                            }
                        } else {
                            finished = false;
                            let _ = txc
                                .send_timeout(PlayerMessage::ProgressPerc(prog), timeout)
                                .await;
                        }
                    }
                });

                while let Some(msg) = wsrx.next().await {
                    match msg {
                        Ok(msg) => {
                            if msg.is_close() {
                                break;
                            }
                            match player_command_handler(msg, &player, tx.clone()).await {
                                Ok(_) => (),
                                Err(e) => {
                                    eprintln!("Error in command handler: {}", &e);
                                    let _ = tx
                                        .send_timeout(
                                            PlayerMessage::Error(e.to_string()),
                                            Duration::from_millis(300),
                                        )
                                        .await;
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("Error: {}", &e);
                        }
                    }
                }

                j.abort();
                j2.abort();
            })
        });
    let route = route.with(warp::cors().allow_any_origin());

    route.boxed()
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type", content = "content")]
pub enum MessageResult<T> {
    Ok(T),
    Err(String),
}
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
struct Message<T> {
    id: Option<u32>,
    #[serde(flatten)]
    data: MessageResult<T>,
}

pub struct FrontendClient<R>(Arc<InnerFrontendClient<R>>);
impl<R> Clone for FrontendClient<R> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}
impl<R> Deref for FrontendClient<R> {
    type Target = InnerFrontendClient<R>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

pub struct InnerFrontendClient<R> {
    id_count: std::sync::atomic::AtomicU32,
    request_sender: mpsc::Sender<Message<R>>,
    request_receiver: Mutex<ReceiverStream<Message<R>>>,
    requests: Mutex<HashMap<u32, oneshot::Sender<MessageResult<String>>>>,
}

impl<R: Send + Sync + Serialize + 'static> FrontendClient<R> {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel(100);
        Self(Arc::new(InnerFrontendClient {
            id_count: Default::default(),
            request_sender: tx,
            request_receiver: Mutex::new(ReceiverStream::new(rx)),
            requests: Mutex::new(HashMap::new()),
        }))
    }

    pub async fn send(&self, msg: MessageResult<R>) -> anyhow::Result<()> {
        self.request_sender
            .send(Message {
                id: None,
                data: msg,
            })
            .await?;
        Ok(())
    }

    pub async fn execute<T: for<'de> Deserialize<'de>>(&self, req: R) -> anyhow::Result<T> {
        let id = self
            .id_count
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        self.request_sender
            .send(Message {
                id: Some(id),
                data: MessageResult::Ok(req),
            })
            .await?;

        let mut map = self.requests.lock().await;
        let (tx, rx) = oneshot::channel::<MessageResult<String>>();
        map.insert(id, tx)
            .is_none()
            .then(|| Some(()))
            .expect("request with this id already exists");
        drop(map);

        let resp = rx.await?;
        dbg!(&resp);
        match resp {
            MessageResult::Ok(resp) => {
                let resp = serde_json::from_str(&resp)?;
                Ok(resp)
            }
            MessageResult::Err(e) => Err(anyhow::anyhow!(e)),
        }
    }
}

fn client_ws_route<R: Send + Sync + Serialize + 'static>(
    fe: FrontendClient<R>,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let ws_route = warp::path(path)
        .and(warp::path::end())
        .and(warp::ws())
        .and(warp::any().map(move || fe.clone()))
        .then(|ws: Ws, fe: FrontendClient<R>| async move {
            ws.on_upgrade(move |ws| async move {
                let (mut wstx, mut wsrx) = ws.split();

                let f = fe.clone();
                let j = tokio::task::spawn(async move {
                    let fe = f;
                    let mut rx = fe.request_receiver.lock().await;
                    while let Some(msg) = rx.next().await {
                        let msg = serde_json::to_string(&msg).unwrap();
                        let msg = ws::Message::text(msg);
                        match wstx.send(msg).await {
                            Ok(_) => (),
                            Err(e) => {
                                eprintln!(
                                    "Failed to send message using websocket - {}",
                                    e.to_string()
                                );
                            }
                        }
                    }
                });

                async fn message_handler<R>(
                    fe: &FrontendClient<R>,
                    msg: ws::Message,
                ) -> anyhow::Result<()> {
                    let msg = msg.to_str().ok().context("message was not a string")?;
                    let msg = serde_json::from_str::<Message<String>>(msg)?;
                    match msg.id {
                        Some(id) => {
                            let mut map = fe.requests.lock().await;
                            let tx = map.remove(&id).context("sender already taken")?;
                            tx.send(msg.data)
                                .ok()
                                .context("could not send over channel")?;
                        }
                        None => {
                            eprintln!("frontend sent a message without id :/ : {:?}", msg);
                        }
                    }
                    Ok(())
                }

                while let Some(msg) = wsrx.next().await {
                    match msg {
                        Ok(msg) => {
                            if msg.is_close() {
                                break;
                            }
                            match message_handler(&fe, msg).await {
                                Ok(_) => (),
                                Err(e) => {
                                    eprintln!("Error: {}", &e);
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("Error: {}", &e);
                        }
                    }
                }

                // NOTE: abort drops everything correctly. so this is fine
                j.abort();
            })
        });
    let ws_route = ws_route.with(warp::cors().allow_any_origin());
    ws_route.boxed()
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct FetchRequest {
    url: String,
    #[serde(default = "Default::default")]
    body: Option<String>,
    headers: String,
    method: String,
}

// - [danielSanchezQ/warp-reverse-proxy](https://github.com/danielSanchezQ/warp-reverse-proxy)
fn cors_proxy_route(c: reqwest::Client) -> BoxedFilter<(impl Reply,)> {
    let cors_proxy = warp::path("fetch")
        .and(warp::path::end())
        // .and(warp::post())
        .and(warp::body::bytes())
        .and(warp::any().map(move || c.clone()))
        .and_then(|fetch: bytes::Bytes, c: reqwest::Client| async move {
            let fetch = fetch.to_vec();
            if fetch.is_empty() {
                // OOF: for preflight requests. idk what else to do
                return warp::http::Response::builder()
                    .body(warp::hyper::Body::empty())
                    .map_err(custom_reject);
            }
            let fetch =
                serde_json::from_slice::<FetchRequest>(fetch.as_ref()).map_err(custom_reject)?;
            let headers: Vec<(String, String)> =
                serde_json::from_str(&fetch.headers).map_err(custom_reject)?;
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
        });
    let cors_proxy = cors_proxy.with(warp::cors().allow_any_origin());
    cors_proxy.boxed()
}

fn redirect_route(c: reqwest::Client) -> BoxedFilter<(impl Reply,)> {
    let redirect = warp::any()
        .and(warp::any().map(move || c.clone()))
        .and(warp::method())
        .and(warp::path::tail())
        .and(warp::header::headers_cloned())
        .and(warp::body::bytes())
        .and_then(
            |c: reqwest::Client,
             m: warp::http::Method,
             p: warp::path::Tail,
             h: warp::http::HeaderMap,
             b: bytes::Bytes| async move {
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

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct WithTransaction<T> {
    transaction_id: u32,
    t: T,
}

fn db_begin_transaction_route(db: Db) -> BoxedFilter<(impl Reply,)> {
    let begin = warp::path("db")
        .and(warp::path("transaction"))
        .and(warp::path("begin"))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and_then(|db: Db| async move {
            let id = db.begin().await.map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&id))
        });

    let begin = begin.with(warp::cors().allow_any_origin());
    begin.boxed()
}

fn db_commit_transaction_route(db: Db) -> BoxedFilter<(impl Reply,)> {
    let begin = warp::path("db")
        .and(warp::path("transaction"))
        .and(warp::path("commit"))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, id: u32| async move {
            db.commit(id).await.map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply())
        });

    let begin = begin.with(warp::cors().allow_any_origin());
    begin.boxed()
}

fn db_rollback_transaction_route(db: Db) -> BoxedFilter<(impl Reply,)> {
    let begin = warp::path("db")
        .and(warp::path("transaction"))
        .and(warp::path("rollback"))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, id: u32| async move {
            db.rollback(id).await.map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply())
        });

    let begin = begin.with(warp::cors().allow_any_origin());
    begin.boxed()
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type", content = "content")]
pub enum InsertResponse<T> {
    New(T),
    Old(T),
}
fn db_insert_route<T: DbAble + Send + Sync + 'static>(
    db: Db,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let insert = warp::path("insert")
        .and(warp::path(path))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, item: WithTransaction<T>| async move {
            for refid in item
                .t
                .refids()
                .into_iter()
                .collect::<Vec<_>>()
                .into_iter()
            {
                if let Some(e) = db
                    .search_by_ref_id::<T>(refid)
                    .await
                    .map_err(custom_reject)?
                {
                    return Ok(warp::reply::json(&InsertResponse::Old(e)));
                }
            }

            let mut txns = db.transactions.lock().await;
            let txn = txns
                .get(&item.transaction_id)
                .context("Transaction not found")
                .map_err(custom_reject)?;
            let id = item.t.insert(txn).await.map_err(custom_reject)?;
            let db_item = crate::db::DbItem {
                id,
                typ: T::typ(),
                t: item,
            };
            Ok::<_, warp::Rejection>(warp::reply::json(&InsertResponse::New(db_item)))
        });
    let insert = insert.with(warp::cors().allow_any_origin());
    insert.boxed()
}

fn db_update_route<T: DbAble + Send + Sync + 'static>(
    db: Db,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let update = warp::path("update")
        .and(warp::path(path))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(
            |db: Db, item: WithTransaction<crate::db::DbItem<T>>| async move {
                let mut txns = db.transactions.lock().await;
                let txn = txns
                    .get(&item.transaction_id)
                    .context("Transaction not found")
                    .map_err(custom_reject)?;
                item.t.update(txn).await.map_err(custom_reject)?;
                Ok::<_, warp::Rejection>(warp::reply())
            },
        );
    let update = update.with(warp::cors().allow_any_origin());
    update.boxed()
}

fn db_delete_route<T: DbAble + Send + Sync + 'static>(
    db: Db,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let delete = warp::path("delete")
        .and(warp::path(path))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(
            |db: Db, item: WithTransaction<crate::db::DbItem<T>>| async move {
                let mut txns = db.transactions.lock().await;
                let txn = txns
                    .get(&item.transaction_id)
                    .context("Transaction not found")
                    .map_err(custom_reject)?;
                item.t.delete(txn).await.map_err(custom_reject)?;
                Ok::<_, warp::Rejection>(warp::reply())
            },
        );
    let delete = delete.with(warp::cors().allow_any_origin());
    delete.boxed()
}

fn db_search_route<T: DbAble + Send>(db: Db, path: &'static str) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, query: crate::db::SearchQuery| async move {
            let res = db.search::<T>(query).await.map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

fn db_search_by_refid_route<T: DbAble + Send>(
    db: Db,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path("refid"))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, query: Vec<String>| async move {
            let res = db
                .search_many_by_ref_id::<T>(query)
                .await
                .map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

fn db_search_by_id_route<T: DbAble + Send>(
    db: Db,
    path: &'static str,
) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path("dbid"))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, query: Vec<crate::db::DbId>| async move {
            let res = db
                .search_many_by_id::<T>(query)
                .await
                .map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

fn db_search_untyped_by_id_route(db: Db, path: &'static str) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path("dbid"))
        .and(warp::path::end())
        .and(warp::any().map(move || db.clone()))
        .and(warp::body::json())
        .and_then(|db: Db, query: Vec<crate::db::DbId>| async move {
            let res = db
                .search_many_untyped_by_id(query)
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

fn linked_search<T, A>(path: &'static str, linked_to: &'static str) -> BoxedFilter<(impl Reply,)>
where
    T: mbz::Linked<A> + Serialize + Send + Sized,
{
    let search = warp::path("search")
        .and(warp::path(path))
        .and(warp::path("linked"))
        .and(warp::path(linked_to))
        .and(warp::path::end())
        .and(warp::body::json())
        .and_then(|query: mbz::SearchQuery| async move {
            use musicbrainz_rs::entity::search::Searchable;

            let res = T::search(query).await.map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&res))
        });
    let search = search.with(warp::cors().allow_any_origin());
    search.boxed()
}

fn mbz_radio_route(c: reqwest::Client) -> BoxedFilter<(impl Reply,)> {
    let search = warp::path("radio")
        .and(warp::path::end())
        .and(warp::body::json())
        .and(warp::any().map(move || c.clone()))
        .and_then(|query: String, c: reqwest::Client| async move {
            let res = mbz::listenbrainz::explore(c, query, mbz::listenbrainz::Mode::Easy)
                .await
                .map_err(custom_reject)?;
            let res = match res {
                mbz::listenbrainz::QueryResult::Ok { payload } => payload.jspf.playlist.track,
                mbz::listenbrainz::QueryResult::Err { code, error } => {
                    return Err(custom_reject(anyhow::anyhow!(error)));
                }
            };
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

fn webui_js_route(c: reqwest::Client) -> BoxedFilter<(impl Reply,)> {
    #[cfg(ui_backend = "WEBUI")]
    let webui = warp::path("webui.js")
        .and(warp::path::end())
        .and(warp::any().map(move || c.clone()))
        .and_then(|c: reqwest::Client| async move {
            let req = c.get("http://localhost:6174/webui.js");
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
        });

    #[cfg(not(ui_backend = "WEBUI"))]
    let webui = warp::path("webui.js")
        .and(warp::path::end())
        .and(warp::any().map(move || c.clone()))
        .and_then(|_: reqwest::Client| async move {
            let mut wres = warp::http::Response::builder();
            wres.body("").map_err(custom_reject)
        });

    let webui = webui.with(warp::cors().allow_any_origin());
    webui.boxed()
}

pub async fn start(ip_addr: Ipv4Addr, port: u16) {
    let client = reqwest::Client::new();
    let db_path = "./test.db";
    let db_exists = std::path::PathBuf::from(db_path).exists();
    let db = Db::new(format!("sqlite:{}?mode=rwc", db_path))
        .await
        .expect("cannot connect to database");
    if !db_exists {
        db.init_tables().await.expect("could not init database");
    }

    let fe = FrontendClient::<YtiRequest>::new();

    let musimanager_search_routes = {
        use crate::musimanager::*;

        warp::path("musimanager").and(
            db_search_route::<Song<Option<SongInfo>>>(db.clone(), "songs")
                .or(db_search_by_refid_route::<Song<Option<SongInfo>>>(
                    db.clone(),
                    "songs",
                ))
                .or(db_search_by_id_route::<Song<Option<SongInfo>>>(
                    db.clone(),
                    "songs",
                ))
                .or(db_insert_route::<Song<Option<SongInfo>>>(
                    db.clone(),
                    "songs",
                ))
                .or(db_update_route::<Song<Option<SongInfo>>>(
                    db.clone(),
                    "songs",
                ))
                .or(db_delete_route::<Song<Option<SongInfo>>>(
                    db.clone(),
                    "songs",
                ))
                .or(db_search_route::<Album<VideoId>>(db.clone(), "albums"))
                .or(db_search_by_refid_route::<Album<VideoId>>(
                    db.clone(),
                    "albums",
                ))
                .or(db_search_by_id_route::<Album<VideoId>>(db.clone(), "albums"))
                .or(db_insert_route::<Album<VideoId>>(db.clone(), "albums"))
                .or(db_update_route::<Album<VideoId>>(db.clone(), "albums"))
                .or(db_delete_route::<Album<VideoId>>(db.clone(), "albums"))
                .or(db_search_route::<Artist<VideoId, AlbumId>>(
                    db.clone(),
                    "artists",
                ))
                .or(db_search_by_id_route::<Artist<VideoId, AlbumId>>(
                    db.clone(),
                    "artists",
                ))
                .or(db_insert_route::<Artist<VideoId, AlbumId>>(
                    db.clone(),
                    "artists",
                ))
                .or(db_update_route::<Artist<VideoId, AlbumId>>(
                    db.clone(),
                    "artists",
                ))
                .or(db_delete_route::<Artist<VideoId, AlbumId>>(
                    db.clone(),
                    "artists",
                ))
                .or(db_search_route::<Playlist<VideoId>>(db.clone(), "playlists"))
                .or(db_search_by_id_route::<Playlist<VideoId>>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_insert_route::<Playlist<VideoId>>(db.clone(), "playlists"))
                .or(db_update_route::<Playlist<VideoId>>(db.clone(), "playlists"))
                .or(db_delete_route::<Playlist<VideoId>>(db.clone(), "playlists"))
                .or(db_search_route::<Queue<VideoId>>(db.clone(), "queues"))
                .or(db_search_by_id_route::<Queue<VideoId>>(db.clone(), "queues"))
                .or(db_insert_route::<Queue<VideoId>>(db.clone(), "queues"))
                .or(db_update_route::<Queue<VideoId>>(db.clone(), "queues"))
                .or(db_delete_route::<Queue<VideoId>>(db.clone(), "queues")),
        )
    };

    let song_tube_search_routes = {
        use crate::yt::song_tube::*;

        warp::path("song_tube").and(
            db_search_route::<Song>(db.clone(), "songs")
                .or(db_search_by_refid_route::<Song>(db.clone(), "songs"))
                .or(db_search_by_id_route::<Song>(db.clone(), "songs"))
                .or(db_insert_route::<Song>(db.clone(), "songs"))
                .or(db_update_route::<Song>(db.clone(), "songs"))
                .or(db_delete_route::<Song>(db.clone(), "songs"))
                // TODO: searching for video separately is annoying. get rid of it
                .or(db_search_route::<Video>(db.clone(), "videos"))
                .or(db_search_by_refid_route::<Video>(db.clone(), "videos"))
                .or(db_search_by_id_route::<Video>(db.clone(), "videos"))
                .or(db_insert_route::<Video>(db.clone(), "videos"))
                .or(db_update_route::<Video>(db.clone(), "videos"))
                .or(db_delete_route::<Video>(db.clone(), "videos"))
                .or(db_search_route::<Album>(db.clone(), "albums"))
                .or(db_search_by_refid_route::<Album>(db.clone(), "albums"))
                .or(db_search_by_id_route::<Album>(db.clone(), "albums"))
                .or(db_insert_route::<Album>(db.clone(), "albums"))
                .or(db_update_route::<Album>(db.clone(), "albums"))
                .or(db_delete_route::<Album>(db.clone(), "albums"))
                .or(db_search_route::<Artist>(db.clone(), "artists"))
                .or(db_search_by_refid_route::<Artist>(db.clone(), "artists"))
                .or(db_search_by_id_route::<Artist>(db.clone(), "artists"))
                .or(db_insert_route::<Artist>(db.clone(), "artists"))
                .or(db_update_route::<Artist>(db.clone(), "artists"))
                .or(db_delete_route::<Artist>(db.clone(), "artists"))
                .or(db_search_route::<Playlist>(db.clone(), "playlists"))
                .or(db_insert_route::<Playlist>(db.clone(), "playlists"))
                .or(db_update_route::<Playlist>(db.clone(), "playlists"))
                .or(db_delete_route::<Playlist>(db.clone(), "playlists"))
                .or(db_search_by_refid_route::<Playlist>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_search_by_id_route::<Playlist>(db.clone(), "playlists"))
                .or(db_insert_route::<Playlist>(db.clone(), "playlists"))
                .or(db_update_route::<Playlist>(db.clone(), "playlists"))
                .or(db_delete_route::<Playlist>(db.clone(), "playlists")),
        )
    };

    let covau_search_routes = {
        use crate::covau_types::*;

        warp::path("covau").and(
            db_search_route::<Song>(db.clone(), "songs")
                .or(db_search_by_refid_route::<Song>(db.clone(), "songs"))
                .or(db_search_by_id_route::<Song>(db.clone(), "songs"))
                .or(db_insert_route::<Song>(db.clone(), "songs"))
                .or(db_update_route::<Song>(db.clone(), "songs"))
                .or(db_delete_route::<Song>(db.clone(), "songs"))
                .or(db_search_route::<Updater>(db.clone(), "updaters"))
                .or(db_search_by_refid_route::<Updater>(db.clone(), "updaters"))
                .or(db_search_by_id_route::<Updater>(db.clone(), "updaters"))
                .or(db_insert_route::<Updater>(db.clone(), "updaters"))
                .or(db_update_route::<Updater>(db.clone(), "updaters"))
                .or(db_delete_route::<Updater>(db.clone(), "updaters"))
                .or(db_search_route::<Playlist>(db.clone(), "playlists"))
                .or(db_search_by_refid_route::<Playlist>(
                    db.clone(),
                    "playlists",
                ))
                .or(db_search_by_id_route::<Playlist>(db.clone(), "playlists"))
                .or(db_insert_route::<Playlist>(db.clone(), "playlists"))
                .or(db_update_route::<Playlist>(db.clone(), "playlists"))
                .or(db_delete_route::<Playlist>(db.clone(), "playlists"))
                .or(db_search_route::<Queue>(db.clone(), "queues"))
                .or(db_search_by_refid_route::<Queue>(db.clone(), "queues"))
                .or(db_search_by_id_route::<Queue>(db.clone(), "queues"))
                .or(db_insert_route::<Queue>(db.clone(), "queues"))
                .or(db_update_route::<Queue>(db.clone(), "queues"))
                .or(db_delete_route::<Queue>(db.clone(), "queues")),
        )
    };

    let mbz_search_routes = {
        use crate::mbz::*;
        use musicbrainz_rs::entity::{artist, recording, release, release_group};

        warp::path("mbz").and(
            mbz_radio_route(client.clone())
                .or(paged_search::<ReleaseWithInfo>("releases_with_info"))
                .or(id_search::<ReleaseWithInfo>("releases_with_info"))
                .or(paged_search::<ReleaseGroupWithInfo>(
                    "release_groups_with_info",
                ))
                .or(id_search::<ReleaseGroupWithInfo>(
                    "release_groups_with_info",
                ))
                .or(paged_search::<Artist>("artists"))
                .or(id_search::<Artist>("artists"))
                .or(id_search::<WithUrlRels<Artist>>("artist_with_urls"))
                .or(paged_search::<RecordingWithInfo>("recordings_with_info"))
                .or(id_search::<RecordingWithInfo>("recordings_with_info"))
                .or(linked_search::<ReleaseGroup, artist::Artist>(
                    "release_groups",
                    "artist",
                ))
                .or(linked_search::<Release, artist::Artist>(
                    "releases", "artist",
                ))
                .or(linked_search::<Release, release_group::ReleaseGroup>(
                    "releases",
                    "release_group",
                ))
                .or(linked_search::<Recording, artist::Artist>(
                    "recordings",
                    "artist",
                ))
                .or(linked_search::<Recording, release::Release>(
                    "recordings",
                    "release",
                )),
        )
    };

    let options_route = warp::any().and(warp::options()).map(warp::reply).with(
        warp::cors()
            .allow_any_origin()
            .allow_header("content-type")
            .allow_methods(["POST", "GET"]),
    );

    // TODO: expose db transactions somehow T_T
    let all = client_ws_route(fe.clone(), "serve")
        .or(player_route())
        .or(cors_proxy_route(client.clone()))
        .or(musimanager_search_routes)
        .or(song_tube_search_routes)
        .or(covau_search_routes)
        .or(db_begin_transaction_route(db.clone()))
        .or(db_commit_transaction_route(db.clone()))
        .or(db_rollback_transaction_route(db.clone()))
        .or(db_search_untyped_by_id_route(db.clone(), "object"))
        .or(mbz_search_routes)
        .or(webui_js_route(client.clone()))
        .or(options_route);
    // let all = all.or(redirect_route(client.clone()));
    let all = all.or(embedded_asset_route());
    let all = all.recover(|rej: warp::reject::Rejection| async move {
        let msg = if let Some(CustomReject(err)) = rej.find() {
            warp::reply::json(&ErrorMessage {
                message: format!("{}", err),
                stack_trace: format!("{:?}", err),
            })
        } else {
            warp::reply::json(&ErrorMessage {
                message: "server error".into(),
                stack_trace: format!("{:?}", rej),
            })
        };
        let r = warp::reply::with_status(msg, warp::http::StatusCode::INTERNAL_SERVER_ERROR);
        let r = warp::reply::with_header(r, "access-control-allow-origin", "*");

        Result::<_, std::convert::Infallible>::Ok(r)
    });

    let j = tokio::task::spawn(async move {
        let fe = fe;
        let db = db;

        updater_system(fe, db).await;
    });

    println!("Starting server at {}:{}", ip_addr, port);

    warp::serve(all).run((ip_addr, port)).await;
    j.abort();
}

async fn _updater_system(fe: FrontendClient<YtiRequest>, db: Db) -> anyhow::Result<()> {
    let manager = crate::covau_types::UpdateManager::new(crate::yt::SongTubeFac::new(fe), db);
    // manager.test().await?;
    Ok(())
}

async fn updater_system(fe: FrontendClient<YtiRequest>, db: Db) {
    match _updater_system(fe, db).await {
        Ok(()) => (),
        Err(e) => {
            eprintln!("updater error: {}", e);
        }
    }
}

pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
    let mut types = String::new();
    types += &specta::ts::export::<Message<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<MessageResult<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<PlayerCommand>(config)?;
    types += ";\n";
    types += &specta::ts::export::<PlayerMessage>(config)?;
    types += ";\n";
    types += &specta::ts::export::<FetchRequest>(config)?;
    types += ";\n";
    types += &specta::ts::export::<InsertResponse<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<WithTransaction<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<ErrorMessage>(config)?;
    types += ";\n";

    Ok(types)
}
