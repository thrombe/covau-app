use anyhow::Context;
use futures::{FutureExt, SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;
use std::ops::Deref;
use std::sync::atomic;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio_stream::wrappers::ReceiverStream;
use warp::filters::BoxedFilter;
use warp::{reply::Reply, ws::Ws};
use warp::{ws, Filter};

use crate::covau_types;
use crate::db::Db;
use crate::yt::YtiRequest;

// [Rejection and anyhow](https://github.com/seanmonstar/warp/issues/307#issuecomment-570833388)
#[derive(Debug)]
struct CustomReject(anyhow::Error);

impl warp::reject::Reject for CustomReject {}

#[derive(Clone, Serialize, Deserialize, specta::Type)]
pub struct ErrorMessage {
    pub message: String,
    pub stack_trace: String,
}
impl core::fmt::Debug for ErrorMessage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)?;
        f.write_str("\n\nErrorMessage stacktrace:\n")?;
        f.write_str(&self.stack_trace)
    }
}
impl core::fmt::Display for ErrorMessage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for ErrorMessage {}

pub(crate) fn custom_reject(error: impl Into<anyhow::Error>) -> warp::Rejection {
    warp::reject::custom(CustomReject(error.into()))
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
#[serde(tag = "type", content = "content")]
pub enum FeRequest {
    Like,
    Dislike,
    Next,
    Prev,
    Pause,
    Play,
    ToggleMute,
    TogglePlay,
    Notify(String),
    NotifyError(String),
}

impl FeRequest {
    pub fn cli_command_route(
        fe: FrontendClient<FeRequest>,
        path: &'static str,
    ) -> BoxedFilter<(impl Reply,)> {
        let route = warp::path(path)
            .and(warp::path::end())
            .and(warp::any().map(move || fe.clone()))
            .and(warp::body::json())
            .and_then(|fe: FrontendClient<_>, req: FeRequest| async move {
                fe.execute::<()>(req).await.map_err(custom_reject)?;
                Ok::<_, warp::Rejection>(warp::reply())
            });
        let route = route.with(warp::cors().allow_any_origin());
        route.boxed()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type", content = "content")]
pub enum MessageResult<T> {
    Ok(T),
    Err(ErrorMessage),
}
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
struct Message<T> {
    id: Option<u32>,
    #[serde(flatten)]
    data: MessageResult<T>,
}

pub mod fe_client {
    use super::*;

    pub struct FrontendClient<R>(Arc<RequestTracker<R>>);
    impl<R> Clone for FrontendClient<R> {
        fn clone(&self) -> Self {
            Self(self.0.clone())
        }
    }
    impl<R> Deref for FrontendClient<R> {
        type Target = RequestTracker<R>;

        fn deref(&self) -> &Self::Target {
            &self.0
        }
    }

    pub struct RequestTracker<R> {
        id_count: std::sync::atomic::AtomicU32,
        request_sender: mpsc::Sender<Message<R>>,
        request_receiver: Mutex<ReceiverStream<Message<R>>>,
        requests: Mutex<HashMap<u32, oneshot::Sender<MessageResult<String>>>>,
    }

    impl<R: Send + Sync + Serialize + 'static> FrontendClient<R> {
        pub fn new() -> Self {
            let (tx, rx) = mpsc::channel(100);
            Self(Arc::new(RequestTracker {
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

        /// NOTE: there is no timeout on these. (so infinite timeout ig)
        ///       you will wait forever if no no response is sent
        // MAYBE: implement timeout?
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
            match resp {
                MessageResult::Ok(resp) => {
                    let resp = serde_json::from_str(&resp)?;
                    Ok(resp)
                }
                MessageResult::Err(e) => Err(e.into()),
            }
        }

        pub fn client_ws_route(fe: Self, path: &'static str) -> BoxedFilter<(impl Reply,)> {
            let ws_route = warp::path("serve")
                .and(warp::path(path))
                .and(warp::path::end())
                .and(warp::ws())
                .and(warp::any().map(move || fe.clone()))
                .then(|ws: Ws, fe: Self| async move {
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
                            let Some(msg) = msg.to_str().ok() else {
                                return Ok(());
                            };
                            let msg = serde_json::from_str::<Message<String>>(msg)?;
                            match msg.id {
                                Some(id) => {
                                    let mut map = fe.requests.lock().await;
                                    let tx = map.remove(&id).context("sender already taken")?;
                                    tx.send(msg.data)
                                        .ok()
                                        .context("could not send over channel")?;
                                }
                                None => match msg.data {
                                    MessageResult::Ok(msg) => {
                                        return Err(anyhow::anyhow!(
                                            "frontend sent a message without id :/ : {:?}",
                                            msg
                                        ));
                                    }
                                    MessageResult::Err(e) => {
                                        println!("frontend could not fullfill some request: {}", e);
                                    }
                                },
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
    }
}
pub use fe_client::FrontendClient;

// pub struct InnerMessageServer<R> {
//     id_count: std::sync::atomic::AtomicU32,
//     request_sender: mpsc::Sender<Message<R>>,
//     request_receiver: Mutex<ReceiverStream<Message<R>>>,
// }
// pub struct MessageServer<R>(pub Arc<InnerMessageServer<R>>);
// impl<R> Clone for MessageServer<R> {
//     fn clone(&self) -> Self {
//         Self(self.0.clone())
//     }
// }
// impl<R> Deref for MessageServer<R> {
//     type Target = InnerMessageServer<R>;

//     fn deref(&self) -> &Self::Target {
//         &self.0
//     }
// }

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct FetchRequest {
    url: String,
    #[serde(default = "Default::default")]
    body: Option<String>,
    headers: String,
    method: String,
}

impl FetchRequest {
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
                let fetch = serde_json::from_slice::<FetchRequest>(fetch.as_ref())
                    .map_err(custom_reject)?;
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
                let port: u16 = core::env!("DEV_VITE_PORT").parse().unwrap();
                let url = format!("http://localhost:{}/", port) + p.as_str();
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

#[derive(rust_embed::Embed)]
#[folder = "electron/dist/"]
pub struct Asset;

impl Asset {
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

        let route = warp::any().and(warp::path::tail()).and_then(
            |t: warp::filters::path::Tail| async move {
                let path = t.as_str();
                serve_impl(path).await
            },
        );

        index_route.or(route).boxed()
    }
}

fn webui_js_route(c: reqwest::Client) -> BoxedFilter<(impl Reply,)> {
    // #[cfg(ui_backend = "WEBUI")]
    let webui = warp::path("webui.js")
        .and(warp::path::end())
        .and(warp::any().map(move || c.clone()))
        .and_then(|c: reqwest::Client| async move {
            let port: u16 = core::env!("WEBUI_PORT").parse().unwrap();
            let req = c.get(&format!("http://localhost:{}/webui.js", port));
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

    // #[cfg(not(ui_backend = "WEBUI"))]
    // let webui = warp::path("webui.js")
    //     .and(warp::path::end())
    //     .and(warp::any().map(move || c.clone()))
    //     .and_then(|_: reqwest::Client| async move {
    //         let mut wres = warp::http::Response::builder();
    //         wres.body("").map_err(custom_reject)
    //     });

    let webui = webui.with(warp::cors().allow_any_origin());
    webui.boxed()
}

pub mod app_state {
    use super::*;

    #[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
    pub enum AppMessage {
        Online,
        Offline, // connected to interwebs
        Load,
        Unload,     // unload before close/refresh
        Visible,    // on screen
        NotVisible, // not on screen
    }
    pub struct InternalAppState {
        close: tokio::sync::Notify,
        is_online: atomic::AtomicBool,
        is_visible: atomic::AtomicBool,
        is_loaded: atomic::AtomicBool,
    }
    #[derive(Clone)]
    pub struct AppState(Arc<InternalAppState>);
    impl AppState {
        pub fn new() -> Self {
            Self(Arc::new(InternalAppState {
                close: tokio::sync::Notify::new(),
                is_online: true.into(),
                is_visible: true.into(),
                is_loaded: true.into(),
            }))
        }

        pub async fn wait(&self) {
            loop {
                self.0.close.notified().await;

                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

                if !self.is_loaded() && !self.is_visible() {
                    return;
                }
            }
        }

        pub fn is_online(&self) -> bool {
            self.0.is_online.load(atomic::Ordering::Relaxed)
        }
        pub fn is_visible(&self) -> bool {
            self.0.is_visible.load(atomic::Ordering::Relaxed)
        }
        pub fn is_loaded(&self) -> bool {
            self.0.is_loaded.load(atomic::Ordering::Relaxed)
        }

        pub fn app_state_handler_route(
            state: AppState,
            path: &'static str,
        ) -> BoxedFilter<(impl Reply,)> {
            let handler = warp::path(path)
                .and(warp::path::end())
                .and(warp::any().map(move || state.clone()))
                .and(warp::body::json())
                .and_then(|state: AppState, message: AppMessage| async move {
                    match message {
                        AppMessage::Online => {
                            state.0.is_online.store(true, atomic::Ordering::Relaxed);
                        }
                        AppMessage::Offline => {
                            state.0.is_online.store(false, atomic::Ordering::Relaxed);
                        }
                        AppMessage::Load => {
                            state.0.is_loaded.store(true, atomic::Ordering::Relaxed);
                        }
                        AppMessage::Unload => {
                            state.0.is_loaded.store(false, atomic::Ordering::Relaxed);
                        }
                        AppMessage::Visible => {
                            state.0.is_visible.store(true, atomic::Ordering::Relaxed);
                        }
                        AppMessage::NotVisible => {
                            state.0.is_visible.store(false, atomic::Ordering::Relaxed);
                        }
                    }

                    Ok::<_, warp::Rejection>(warp::reply())
                });
            let handler = handler.with(warp::cors().allow_any_origin());
            handler.boxed()
        }
    }
}
pub use app_state::{AppMessage, AppState};

pub async fn start(ip_addr: Ipv4Addr, port: u16, config: Arc<crate::cli::DerivedConfig>) {
    let client = reqwest::Client::new();
    let db_path = config.db_path.join("music.db");
    let db_exists = db_path.exists();
    let db = Db::new(format!("sqlite:{}?mode=rwc", db_path.to_string_lossy()))
        .await
        .expect("cannot connect to database");
    if !db_exists {
        db.init_tables().await.expect("could not init database");

        if let Some(path) = config.musimanager_db_path.as_ref() {
            db.init_musimanager_data(path)
                .await
                .expect("could not init musimanager data");
        }
    }

    let yti = FrontendClient::<YtiRequest>::new();
    let fe = FrontendClient::<FeRequest>::new();
    let state = AppState::new();

    let options_route = warp::any().and(warp::options()).map(warp::reply).with(
        warp::cors()
            .allow_any_origin()
            .allow_header("content-type")
            .allow_methods(["POST", "GET"]),
    );

    // TODO: expose db transactions somehow T_T
    let all = FrontendClient::client_ws_route(yti.clone(), "yti")
        .or(FrontendClient::client_ws_route(fe.clone(), "fec"))
        .or(FeRequest::cli_command_route(fe.clone(), "cli"))
        .or(AppState::app_state_handler_route(state.clone(), "app"))
        .or(crate::server::player::player_route())
        .or(FetchRequest::cors_proxy_route(client.clone()))
        .or(crate::server::db::db_routes(db.clone(), client.clone()))
        .or(webui_js_route(client.clone()))
        .or(options_route.boxed());
    // let all = all.or(redirect_route(client.clone()));
    let all = all.or(Asset::embedded_asset_route());
    let all = all.recover(|rej: warp::reject::Rejection| async move {
        let msg = if let Some(CustomReject(err)) = rej.find() {
            match err.downcast_ref() {
                Some(ErrorMessage {
                    message,
                    stack_trace,
                }) => warp::reply::json(&ErrorMessage {
                    message: message.into(),
                    stack_trace: stack_trace.into(),
                }),
                None => warp::reply::json(&ErrorMessage {
                    message: format!("{}", err),
                    stack_trace: format!("{:?}", err),
                }),
            }
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

    let conf = config.clone();
    let j = tokio::task::spawn(async move {
        let yti = yti;
        let db = db;
        let fec = fe;

        updater_system(yti, fec, client, db, conf).await;
    });

    println!("Starting server at {}:{}", ip_addr, port);

    if config.run_in_background {
        warp::serve(all).run((ip_addr, port)).await;
    } else {
        tokio::select! {
            _ = warp::serve(all).run((ip_addr, port)) => { },
            _ = state.wait() => { },
        }
    }

    j.abort();
}

async fn _updater_system(
    yti: FrontendClient<YtiRequest>,
    fec: FrontendClient<FeRequest>,
    client: reqwest::Client,
    db: Db,
    config: Arc<crate::cli::DerivedConfig>,
) -> anyhow::Result<()> {
    let ytf = crate::yt::SongTubeFac::new(yti, client, config);
    let _manager = covau_types::UpdateManager::new(ytf, fec, db);
    // manager.start().await?;
    Ok(())
}

async fn updater_system(
    yti: FrontendClient<YtiRequest>,
    fec: FrontendClient<FeRequest>,
    client: reqwest::Client,
    db: Db,
    config: Arc<crate::cli::DerivedConfig>,
) {
    match _updater_system(yti, fec, client, db, config).await {
        Ok(()) => (),
        Err(e) => {
            eprintln!("updater error: {}", e);
        }
    }
}

pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
    let mut types = String::new();
    types += "import type { DbMetadata } from '$types/db.ts';\n";
    types += ";\n";
    types += &specta::ts::export::<Message<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<MessageResult<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<FeRequest>(config)?;
    types += ";\n";
    types += &specta::ts::export::<AppMessage>(config)?;
    types += ";\n";
    types += &specta::ts::export::<crate::server::player::PlayerCommand>(config)?;
    types += ";\n";
    types += &specta::ts::export::<crate::server::player::PlayerMessage>(config)?;
    types += ";\n";
    types += &specta::ts::export::<crate::server::db::UpdateMetadataQuery>(config)?;
    types += ";\n";
    types += &specta::ts::export::<FetchRequest>(config)?;
    types += ";\n";
    types += &specta::ts::export::<crate::server::db::InsertResponse<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<crate::server::db::WithTransaction<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<ErrorMessage>(config)?;
    types += ";\n";

    Ok(types)
}
