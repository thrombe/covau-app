use std::ops::Deref;
use std::sync::atomic;
use std::{collections::HashMap, sync::Arc};

use anyhow::Context;
use futures::{FutureExt, Stream};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio_stream::wrappers::ReceiverStream;
use warp::filters::BoxedFilter;
use warp::{reply::Reply, ws::Ws};
use warp::{ws, Filter};

use crate::yt::SongTubeFac;
use crate::{
    cli::DerivedConfig,
    covau_types::{SourcePath, SourcePathType},
    server::{custom_reject, ErrorMessage, Message, MessageResult},
};

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
    ok_one: Mutex<HashMap<u32, oneshot::Sender<MessageResult<String>>>>,
    ok_many: Mutex<HashMap<u32, mpsc::Sender<MessageResult<String>>>>,
}

impl<R: Send + Sync + Serialize + 'static> FrontendClient<R> {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel(100);
        Self(Arc::new(RequestTracker {
            id_count: Default::default(),
            request_sender: tx,
            request_receiver: Mutex::new(ReceiverStream::new(rx)),
            ok_one: Mutex::new(HashMap::new()),
            ok_many: Mutex::new(HashMap::new()),
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
    pub async fn get_one<T: for<'de> Deserialize<'de>>(&self, req: R) -> anyhow::Result<T> {
        let id = self
            .id_count
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        let mut map = self.ok_one.lock().await;
        let (tx, rx) = oneshot::channel::<MessageResult<String>>();
        map.insert(id, tx)
            .is_none()
            .then(|| Some(()))
            .expect("request with this id already exists");
        drop(map);

        self.request_sender
            .send(Message {
                id: Some(id),
                data: MessageResult::Request(req),
            })
            .await?;

        let resp = rx.await?;
        match resp {
            MessageResult::OkOne(resp) => {
                let resp = serde_json::from_str(&resp)?;
                Ok(resp)
            }
            MessageResult::OkMany { data, .. } => Err(anyhow::anyhow!(format!(
                "got 'OkMany' where 'OkOne' was expected: {}",
                data
            ))),
            MessageResult::Request(data) => Err(anyhow::anyhow!(format!(
                "got 'Request' where 'OkOne' was expected: {}",
                data
            ))),
            MessageResult::Err(e) => Err(e.into()),
        }
    }

    pub async fn get_many<T: for<'de> Deserialize<'de>>(
        &self,
        req: R,
    ) -> anyhow::Result<impl Stream<Item = anyhow::Result<T>>> {
        let id = self
            .id_count
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        let mut map = self.ok_many.lock().await;
        let (tx, rx) = mpsc::channel::<MessageResult<String>>(20);
        map.insert(id, tx)
            .is_none()
            .then(|| Some(()))
            .expect("request with this id already exists");
        drop(map);

        self.request_sender
            .send(Message {
                id: Some(id),
                data: MessageResult::Request(req),
            })
            .await?;

        let resp = ReceiverStream::new(rx).map(|m| match m {
            MessageResult::OkOne(resp) => Err(anyhow::anyhow!(format!(
                "got 'OkOne' where 'OkMany' was expected: {}",
                resp
            ))),
            MessageResult::Request(req) => Err(anyhow::anyhow!(format!(
                "got 'Request' where 'OkMany' was expected: {}",
                req
            ))),
            MessageResult::OkMany { data, .. } => {
                let data = serde_json::from_str::<T>(&data)?;
                Ok(data)
            }
            MessageResult::Err(e) => Err(e.into()),
        });
        Ok(resp)
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
                            Some(id) => match msg.data {
                                MessageResult::OkMany { data, done, index } => {
                                    let mut map = fe.ok_many.lock().await;
                                    let tx = map.remove(&id).context("sender already taken")?;
                                    tx.send(MessageResult::OkMany { data, done, index })
                                        .await
                                        .ok()
                                        .context("could not send over channel (1)")?;
                                    if !done {
                                        map.insert(id, tx);
                                    }
                                }
                                MessageResult::OkOne(msg) => {
                                    let mut map = fe.ok_one.lock().await;
                                    let tx = map.remove(&id).context("sender already taken")?;
                                    tx.send(MessageResult::OkOne(msg))
                                        .ok()
                                        .context("could not send over channel (2)")?;
                                }
                                MessageResult::Err(err) => {
                                    let mut onemap = fe.ok_one.lock().await;
                                    let mut manymap = fe.ok_many.lock().await;
                                    if let Some(tx) = onemap.remove(&id) {
                                        tx.send(MessageResult::Err(err))
                                            .ok()
                                            .context("could not send over channel (3)")?;
                                    } else {
                                        let tx =
                                            manymap.remove(&id).context("sender already taken")?;
                                        tx.send(MessageResult::Err(err))
                                            .await
                                            .ok()
                                            .context("could not send over channel (4)")?;
                                    }
                                }
                                MessageResult::Request(msg) => {
                                    let mut onemap = fe.ok_one.lock().await;
                                    let mut manymap = fe.ok_many.lock().await;
                                    if let Some(tx) = onemap.remove(&id) {
                                        let mesg = format!(
                                            "this WS does not support requests from frontend: {}",
                                            msg
                                        );
                                        tx.send(MessageResult::Err(ErrorMessage {
                                            message: mesg.clone(),
                                            stack_trace: mesg,
                                        }))
                                        .ok()
                                        .context("could not send over channel (5)")?;
                                    } else {
                                        let tx =
                                            manymap.remove(&id).context("sender already taken")?;
                                        let mesg = format!(
                                            "this WS does not support requests from frontend: {}",
                                            msg
                                        );
                                        tx.send(MessageResult::Err(ErrorMessage {
                                            message: mesg.clone(),
                                            stack_trace: mesg,
                                        }))
                                        .await
                                        .ok()
                                        .context("could not send over channel (6)")?;
                                    }
                                }
                            },
                            None => match msg.data {
                                MessageResult::OkOne(msg)
                                | MessageResult::OkMany { data: msg, .. }
                                | MessageResult::Request(msg) => {
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
    Repeat,
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
                fe.get_one::<()>(req).await.map_err(custom_reject)?;
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
    pub fn embedded_asset_route(config: Arc<DerivedConfig>) -> BoxedFilter<(impl Reply,)> {
        let mut env = HashMap::new();
        env.insert("%SERVER_PORT%".to_string(), config.server_port.to_string());
        let env = Arc::new(env);

        async fn serve_impl(
            path: &str,
            env: Arc<HashMap<String, String>>,
        ) -> Result<impl Reply, warp::Rejection> {
            let asset = Asset::get(path).ok_or_else(warp::reject::not_found)?;
            let mime = mime_guess::from_path(path).first_or_octet_stream();

            if path.ends_with(".wasm") {
                let mut res = warp::reply::Response::new(asset.data.into());
                res.headers_mut().insert(
                    "content-type",
                    warp::http::HeaderValue::from_str(mime.as_ref()).unwrap(),
                );
                Ok::<_, warp::Rejection>(res)
            } else {
                let mut data = String::from_utf8_lossy(asset.data.as_ref()).into_owned();
                for (k, v) in env.iter() {
                    data = data.replace(k, v);
                }

                let mut res = warp::reply::Response::new(data.into());
                res.headers_mut().insert(
                    "content-type",
                    warp::http::HeaderValue::from_str(mime.as_ref()).unwrap(),
                );
                Ok::<_, warp::Rejection>(res)
            }
        }

        let _env = env.clone();
        let index_route = warp::any()
            .and(warp::path::end())
            .and(warp::any().map(move || _env.clone()))
            .and_then(|env: Arc<HashMap<String, String>>| async move {
                let path = "index.html";
                serve_impl(path, env).await
            });

        let route = warp::any()
            .and(warp::path::tail())
            .and(warp::any().map(move || env.clone()))
            .and_then(
                |t: warp::filters::path::Tail, env: Arc<HashMap<String, String>>| async move {
                    let path = t.as_str();
                    serve_impl(path, env).await
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

#[cfg(build_mode = "DEV")]
pub fn redirect_route(
    c: reqwest::Client,
    config: Arc<DerivedConfig>,
) -> BoxedFilter<(impl Reply,)> {
    let redirect = warp::any()
        .and(warp::any().map(move || c.clone()))
        .and(warp::method())
        .and(warp::path::tail())
        .and(warp::header::headers_cloned())
        .and(warp::body::bytes())
        .and(warp::any().map(move || config.clone()))
        .and_then(
            |c: reqwest::Client,
             m: warp::http::Method,
             p: warp::path::Tail,
             h: warp::http::HeaderMap,
             b: bytes::Bytes,
             config: Arc<DerivedConfig>| async move {
                let port = config.dev_vite_port;
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
    config: Arc<DerivedConfig>,
) -> warp::filters::BoxedFilter<(impl warp::reply::Reply,)> {
    let route = warp::path(path)
        .and(warp::path::end())
        .and(warp::any().map(move || config.clone()))
        .and(warp::body::json())
        .and_then(|config: Arc<DerivedConfig>, path: SourcePath| async move {
            let path = config.to_path(path).map_err(custom_reject)?;
            Ok::<_, warp::Rejection>(warp::reply::json(&path))
        });

    let route = route.with(warp::cors().allow_any_origin());
    route.boxed()
}

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct YtStreamQuery {
    size: u32,
    id: String,
}
pub fn stream_yt(path: &'static str, st: SongTubeFac) -> BoxedFilter<(impl Reply,)> {
    let route = warp::path("stream")
        .and(warp::path(path))
        .and(warp::query::<YtStreamQuery>())
        .and(warp::header::headers_cloned())
        .and(warp::any().map(move || st.clone()))
        .and_then(
            |query: YtStreamQuery, headers: warp::http::HeaderMap, st: SongTubeFac| async move {
                let chunk = 1000_000;

                let (s, e) = headers
                    .get("range")
                    .map(|h| h.to_str())
                    .transpose()
                    .map_err(custom_reject)?
                    .map(|h| h.strip_prefix("bytes="))
                    .flatten()
                    .map(|h| h.split_once("-"))
                    .flatten()
                    .map(|(s, e)| {
                        Ok::<_, anyhow::Error>((s.parse::<usize>()?, e.parse::<usize>().ok()))
                    })
                    .transpose()
                    .map_err(custom_reject)?
                    .map(|(s, e)| (s, e.unwrap_or(query.size as usize - 1)))
                    .unwrap_or((0, query.size as usize - 1));
                let len = e + 1 - s;

                // dbg!(s, e, &headers);

                let fullchunks = len / chunk;
                let chunkpoints = (0..fullchunks)
                    .map(move |i| i * chunk)
                    .map(move |i| i + s)
                    .chain(std::iter::once(e + 1));
                let chunkpoints = std::iter::once(s).chain(chunkpoints);
                let iter = chunkpoints
                    .clone()
                    .zip(chunkpoints.clone().skip(1))
                    .filter(|(s, e)| *e > *s)
                    .map(|(s, e)| (s as u32, e as u32 - 1));
                // dbg!(iter.clone().collect::<Vec<_>>());
                let iter = iter.map(move |(s, e)| (s, e, st.clone(), query.id.clone()));
                let bytes = futures::stream::iter(iter).then(|(s, e, st, id)| async move {
                    // dbg!(&id, s, e);
                    let bytes = st
                        .get_song_bytes_chunked(id, s, e, e + 1 - s)
                        .await?
                        .collect::<Vec<_>>()
                        .await
                        .into_iter()
                        .collect::<anyhow::Result<Vec<_>>>()?
                        .into_iter()
                        .map(|b| b.into_iter())
                        .flatten()
                        .collect::<Vec<_>>();
                    // dbg!(bytes.len());
                    Ok::<_, anyhow::Error>(bytes)
                });

                let body = warp::hyper::Body::wrap_stream(bytes);
                // let bytes = bytes
                //     .collect::<Vec<_>>()
                //     .await
                //     .into_iter()
                //     .collect::<anyhow::Result<Vec<_>>>()
                //     .map_err(custom_reject)?
                //     .into_iter()
                //     .map(|b| b.into_iter())
                //     .flatten()
                //     .collect::<Vec<_>>();
                // let len = bytes.len();
                // dbg!(len);
                // let body = warp::hyper::Body::from(bytes);

                // - [can't seek html5 video or audio in chrome](https://stackoverflow.com/a/61229273)
                let wres = warp::http::Response::builder()
                    .header("content-type", "video/webm")
                    .header("content-range", format!("bytes {}-{}/{}", s, e, query.size))
                    .header("content-length", format!("{}", e + 1 - s))
                    .header("accept-ranges", "bytes")
                    .header("cache-control", "max-age=0");
                wres.status(206).body(body).map_err(custom_reject)
            },
        );

    let route = route.with(warp::cors().allow_any_origin());
    route.boxed()
}

pub fn stream_file(path: &'static str, config: Arc<DerivedConfig>) -> BoxedFilter<(impl Reply,)> {
    let route = warp::path("stream")
        .and(warp::path(path))
        .and(warp::query::<SourcePath>())
        .and(warp::header::headers_cloned())
        .and(warp::any().map(move || config.clone()))
        .and_then(
            |src: SourcePath,
             headers: warp::http::HeaderMap,
             config: Arc<DerivedConfig>| async move {
                let path = config.to_path(src).map_err(custom_reject)?;

                // TODO: cursor + read as much bytes as needed
                let bytes = tokio::fs::read(&path).await.map_err(custom_reject)?;
                let total = bytes.len();

                let (s, e) = headers
                    .get("range")
                    .map(|h| h.to_str())
                    .transpose()
                    .map_err(custom_reject)?
                    .map(|h| h.strip_prefix("bytes="))
                    .flatten()
                    .map(|h| h.split_once("-"))
                    .flatten()
                    .map(|(s, e)| Ok::<_, anyhow::Error>((s.parse::<usize>()?, e.parse::<usize>().ok())))
                    .transpose()
                    .map_err(custom_reject)?
                    .map(|(s, e)| (s, e.unwrap_or(bytes.len() - 1)))
                    .unwrap_or((0, bytes.len() - 1));

                let body = warp::hyper::Body::from(bytes.into_iter().take(e + 1).skip(s).collect::<Vec<_>>());
                let mime = mime_guess::from_path(&path)
                    .first()
                    .map(|mime| mime.to_string())
                    .map(|mime| {
                        if mime == "audio/m4a" {
                            "audio/aac".to_owned()
                            // "audio/mp4".to_owned()
                        } else {
                            mime
                        }
                    })
                    .context("Could not figure out mime type of file")
                    .map_err(custom_reject)?;

                // - [can't seek html5 video or audio in chrome](https://stackoverflow.com/a/61229273)
                let wres = warp::http::Response::builder()
                    .header("content-type", mime)
                    .header("content-range", format!("bytes {}-{}/{}", s, e, total))
                    .header("content-length", format!("{}", e + 1 - s))
                    .header("accept-ranges", "bytes")
                    .header("cache-control", "max-age=0");
                wres.status(206).body(body).map_err(custom_reject)
            },
        );

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

            let bytes = ytf.get_song_bytes(id).await.map_err(custom_reject)?;

            let dest = ytf.config.music_path.join(&name);
            let mut file = tokio::fs::File::create_new(&dest)
                .await
                .map_err(custom_reject)?;
            file.write_all(&bytes).await.map_err(custom_reject)?;

            let path = SourcePath {
                typ: SourcePathType::CovauMusic,
                path: name,
            };

            Ok::<_, warp::Rejection>(warp::reply::json(&path))
        });

    let route = route.with(warp::cors().allow_any_origin());
    route.boxed()
}

// TODO: support
//   - local file
//   - mbz id
//   - cache
//   - resize
//   - chop backgrounds
#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct ImageQuery {
    src: String,
}
pub fn image_route(
    path: &'static str,
    c: reqwest::Client,
    config: Arc<DerivedConfig>,
) -> BoxedFilter<(impl Reply,)> {
    let redirect = warp::path(path)
        .and(warp::path::end())
        .and(warp::query::<ImageQuery>())
        .and(warp::header::headers_cloned())
        .and(warp::any().map(move || c.clone()))
        .and(warp::any().map(move || config.clone()))
        .and_then(
            |query: ImageQuery,
             headers: warp::http::HeaderMap,
             client: reqwest::Client,
             _config: Arc<DerivedConfig>| async move {
                let mut req = client.get(&query.src);
                for k in [
                    "accept",
                    "accept-encoding",
                    "accept-language",
                    "connection",
                    "DNT",
                    "user-agent",
                ] {
                    if let Some(v) = headers.get(k) {
                        req = req.header(k, v);
                    }
                }
                let res = client
                    .execute(req.build().map_err(custom_reject)?)
                    .await
                    .map_err(custom_reject)?;

                let headers = res.headers();
                let mut wres = warp::http::Response::builder();
                for k in [
                    "accept-ranges",
                    "age",
                    "cache-control",
                    "alt-svc",
                    "content-length",
                    "content-type",
                    "server",
                ] {
                    if let Some(v) = headers.get(k) {
                        wres = wres.header(k, v);
                    }
                }
                // for (k, v) in res.headers().iter() {
                //     wres = wres.header(k, v);
                // }
                wres = wres.header("access-control-allow-origin", "*");
                let status = res.status();
                let body = warp::hyper::Body::wrap_stream(res.bytes().into_stream());
                wres.status(status).body(body).map_err(custom_reject)
            },
        );
    redirect.boxed()
}

pub fn webui_js_route(
    c: reqwest::Client,
    config: Arc<DerivedConfig>,
) -> BoxedFilter<(impl Reply,)> {
    #[cfg(feature = "webui")]
    let webui = warp::path("webui.js")
        .and(warp::path::end())
        .and(warp::any().map(move || c.clone()))
        .and(warp::any().map(move || config.clone()))
        .and_then(
            |c: reqwest::Client, config: Arc<DerivedConfig>| async move {
                let port = config.webui_port;
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
            },
        );

    #[cfg(not(feature = "webui"))]
    let webui = warp::path("webui.js")
        .and(warp::path::end())
        .and(warp::any().map(move || c.clone()))
        .and(warp::any().map(move || config.clone()))
        .and_then(|_: reqwest::Client, _: Arc<DerivedConfig>| async move {
            let wres = warp::http::Response::builder();
            wres.body("").map_err(custom_reject)
        });

    let webui = webui.with(warp::cors().allow_any_origin());
    webui.boxed()
}
