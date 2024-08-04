use std::ops::Deref;
use std::sync::atomic;
use std::{collections::HashMap, sync::Arc};

use anyhow::Context;
use futures::FutureExt;
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio_stream::wrappers::ReceiverStream;
use warp::filters::BoxedFilter;
use warp::{reply::Reply, ws::Ws};
use warp::{ws, Filter};

use crate::server::{custom_reject, Message, MessageResult};

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
                            Ok(msg) => match message_handler(&fe, msg).await {
                                Ok(_) => (),
                                Err(e) => {
                                    eprintln!("Error: {}", &e);
                                }
                            },
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
    BlacklistArtists,
    RemoveAndNext,
    SeekFwd,
    SeekBkwd,
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

#[derive(rust_embed::Embed)]
#[folder = "electron/dist/"]
pub struct Asset;

impl Asset {
    pub fn embedded_asset_route() -> BoxedFilter<(impl Reply,)> {
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

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct ProxyRequest {
    url: String,
    #[serde(default = "Default::default")]
    body: Option<String>,
    headers: String,
    method: String,
}

impl ProxyRequest {
    // - [danielSanchezQ/warp-reverse-proxy](https://github.com/danielSanchezQ/warp-reverse-proxy)
    pub fn cors_proxy_route(c: reqwest::Client) -> BoxedFilter<(impl Reply,)> {
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
                let fetch = serde_json::from_slice::<ProxyRequest>(fetch.as_ref())
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

pub fn redirect_route(c: reqwest::Client) -> BoxedFilter<(impl Reply,)> {
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

pub fn source_path_route(
    path: &'static str,
    config: Arc<crate::cli::DerivedConfig>,
) -> warp::filters::BoxedFilter<(impl warp::reply::Reply,)> {
    let route = warp::path(path)
        .and(warp::path::end())
        .and(warp::any().map(move || config.clone()))
        .and(warp::body::json())
        .and_then(|config: Arc<crate::cli::DerivedConfig>, path: crate::covau_types::SourcePath| async move {
            let path = config.to_path(path).map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&path))
        });

    let route = route.with(warp::cors().allow_any_origin());
    route.boxed()
}

pub fn save_song_route(
    path: &'static str,
    ytf: crate::yt::SongTubeFac,
) -> warp::filters::BoxedFilter<(impl warp::reply::Reply,)> {
    let route = warp::path(path)
        .and(warp::path::end())
        .and(warp::any().map(move || ytf.clone()))
        .and(warp::body::json())
        .and_then(|ytf: crate::yt::SongTubeFac, id: String| async move {
            let name = format!("{}.webm", &id);

            let bytes = ytf.get_song(id).await.map_err(custom_reject)?;

            let dest = ytf.config.music_path.join(&name);
            let mut file = tokio::fs::File::create_new(&dest)
                .await
                .map_err(custom_reject)?;
            file.write_all(&bytes).await.map_err(custom_reject)?;

            let path = crate::covau_types::SourcePath {
                typ: crate::covau_types::SourcePathType::CovauMusic,
                path: name,
            };

            Ok::<_, warp::Rejection>(warp::reply::json(&path))
        });

    let route = route.with(warp::cors().allow_any_origin());
    route.boxed()
}

pub fn webui_js_route(c: reqwest::Client) -> BoxedFilter<(impl Reply,)> {
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
