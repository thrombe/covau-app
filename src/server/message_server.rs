use std::convert::Infallible;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use futures::{SinkExt, StreamExt, TryFutureExt};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc::{self, Sender};
use tokio_stream::wrappers::ReceiverStream;
use warp::filters::BoxedFilter;
use warp::Filter;
use warp::Reply;

use crate::server::{ErrorMessage, Message, MessageResult};

fn get_id_route(path: &'static str, id: Arc<AtomicU32>) -> BoxedFilter<(impl Reply,)> {
    let route = warp::path("serve")
        .and(warp::path(path))
        .and(warp::path("new_id"))
        .and(warp::path::end())
        .and(warp::any().map(move || id.clone()))
        .and_then(|id: Arc<AtomicU32>| async move {
            let id = id.fetch_add(1, Ordering::Relaxed);
            Ok::<_, Infallible>(warp::reply::json(&id))
        });

    let route = route.with(warp::cors().allow_any_origin());
    route.boxed()
}

fn client_ws_route<R: MessageServerRequest<Ctx = Ctx>, Ctx: Clone + Sync + Send + 'static>(
    path: &'static str,
    ctx: Ctx,
    id: Arc<AtomicU32>,
) -> BoxedFilter<(impl Reply,)> {
    let ws_route = warp::path("serve")
        .and(warp::path(path))
        .and(warp::path::end())
        .and(warp::ws())
        .and(warp::any().map(move || ctx.clone()))
        .and(warp::any().map(move || id.clone()))
        .then(|ws: warp::ws::Ws, ctx: Ctx, id: Arc<AtomicU32>| async move {
            ws.on_upgrade(move |ws| async move {
                let ctx = ctx.clone();
                let (mut wstx, mut wsrx) = ws.split();
                let (tx, rx) = mpsc::channel::<Message<String>>(100);
                let mut rx = ReceiverStream::new(rx);

                let j = tokio::task::spawn(async move {
                    while let Some(msg) = rx.next().await {
                        let msg = serde_json::to_string(&msg).unwrap();
                        let msg = warp::ws::Message::text(msg);
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

                async fn message_handler<R: MessageServerRequest<Ctx = Ctx>, Ctx: Clone>(
                    sender: Sender<Message<String>>,
                    msg: warp::ws::Message,
                    ctx: Ctx,
                    id_src: Arc<AtomicU32>,
                ) -> anyhow::Result<()> {
                    let Some(msg) = msg.to_str().ok() else {
                        return Ok(());
                    };
                    let msg = serde_json::from_str::<Message<String>>(msg)?;
                    match msg.id {
                        Some(id) => match msg.data {
                            MessageResult::Request(data) => {
                                let res = async { serde_json::from_str(&data) }
                                    .map_err(|e| anyhow::anyhow!(e))
                                    .and_then(move |req: R| req.handle(ctx, id_src))
                                    .await;
                                match res {
                                    Ok(res) => {
                                        sender
                                            .send(Message {
                                                id: Some(id),
                                                data: res,
                                            })
                                            .await?;
                                    }
                                    Err(err) => {
                                        sender
                                            .send(Message {
                                                id: Some(id),
                                                data: MessageResult::Err(ErrorMessage {
                                                    message: format!("{}", err),
                                                    stack_trace: format!("{:?}", err),
                                                }),
                                            })
                                            .await?;
                                    }
                                }
                            }
                            MessageResult::OkMany { data, .. } => {
                                return Err(anyhow::anyhow!(
                                    "frontend sent 'OkMany' where 'Request' was expected :/ : {:?}",
                                    data
                                ));
                            }
                            MessageResult::OkOne(req) => {
                                return Err(anyhow::anyhow!(
                                    "frontend sent 'OkOne' where 'Request' was expected :/ : {:?}",
                                    req
                                ));
                            }
                            MessageResult::Err(err) => {
                                println!("frontend sent an error: {}", err);
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
                                println!("frontend sent an error: {}", e);
                            }
                        },
                    }
                    Ok(())
                }

                while let Some(msg) = wsrx.next().await {
                    match msg {
                        Ok(msg) => {
                            let tx = tx.clone();
                            let ctx = ctx.clone();
                            let id = id.clone();
                            let _j = tokio::task::spawn(async move {
                                match message_handler::<R, Ctx>(tx, msg, ctx, id.clone()).await {
                                    Ok(_) => (),
                                    Err(e) => {
                                        eprintln!("Error: {}", &e);
                                    }
                                }
                            });
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

#[async_trait::async_trait]
pub trait MessageServerRequest
where
    Self: Sized + Send + Sync + Serialize + for<'de> Deserialize<'de> + 'static,
{
    type Ctx: Clone + Send + Sync + 'static;

    async fn handle(self, ctx: Self::Ctx, id: Arc<AtomicU32>) -> anyhow::Result<MessageResult<String>>;

    fn routes(ctx: Self::Ctx, path: &'static str) -> BoxedFilter<(impl Reply,)> {
        let id: Arc<AtomicU32> = Arc::new(0.into());
        client_ws_route::<Self, _>(path, ctx, id.clone())
            .or(get_id_route(path, id))
            .boxed()
    }
}
