use anyhow::Context;
use core::time;
use futures::{FutureExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::borrow::Borrow;
use std::net::Ipv4Addr;
use std::{collections::HashMap, convert::Infallible, sync::Arc};
use tokio::sync::{mpsc, Mutex};
use tokio::time::Duration;
use tokio_stream::wrappers::{ReceiverStream, UnboundedReceiverStream};
use ulid::Ulid;
use warp::filters::BoxedFilter;
use warp::ws::WebSocket;
use warp::{reject::Rejection, reply::Reply, ws::Ws};
use warp::{ws, Filter};

use crate::musiplayer::Player;

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
                for i in 0..50 {
                    tokio::time::sleep(timeout).await;
                    let mut p = player.lock().await;
                    let dur = p.duration()?;
                    if dur > 0.5 {
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
}

fn player_route() -> BoxedFilter<(impl Reply,)> {
    let player = Arc::new(Mutex::new(Player::new().expect("could not start player")));

    let route = warp::path("player")
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

pub async fn start(ip_addr: Ipv4Addr, port: u16) {
    let client = Arc::new(Mutex::new(reqwest::Client::new()));

    let all = client_ws_route()
        .or(player_route())
        .or(cors_proxy_route(client.clone()));
    let all = all.or(redirect_route(client.clone()));

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
