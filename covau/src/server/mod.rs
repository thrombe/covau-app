use serde::{Deserialize, Serialize};
use std::{net::Ipv4Addr, sync::Arc, time};
use warp::Filter;

use crate::{
    cli::DerivedConfig,
    covau_types,
    db::Db,
    server::{
        self,
        db::DbRequest,
        mbz::mbz_routes,
        routes::{
            image_route, save_song_route, source_path_route, stream_file, stream_yt, AppState,
            Asset, FeRequest, FrontendClient, ProxyRequest,
        },
    },
    yt::YtiRequest,
};

pub mod db;
pub mod mbz;
pub mod message_server;
pub mod player;
pub mod routes;

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

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type", content = "content")]
pub enum MessageResult<T> {
    Request(T),
    OkOne(T),
    OkMany { data: T, done: bool, index: u32 },
    Err(ErrorMessage),
}
impl<T: Serialize> MessageResult<T> {
    pub fn json(self) -> MessageResult<String> {
        match self {
            MessageResult::OkMany { data, done, index } => MessageResult::OkMany {
                data: serde_json::to_string(&data).unwrap(),
                done,
                index,
            },
            MessageResult::OkOne(t) => MessageResult::OkOne(serde_json::to_string(&t).unwrap()),
            MessageResult::Request(t) => MessageResult::Request(serde_json::to_string(&t).unwrap()),
            MessageResult::Err(e) => MessageResult::Err(e),
        }
    }
    pub fn is_done(&self) -> bool {
        match self {
            MessageResult::OkMany { done, .. } => *done,
            MessageResult::OkOne(_) | MessageResult::Err(_) | MessageResult::Request(_) => true,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct Message<T> {
    pub id: Option<u32>,
    #[serde(flatten)]
    pub data: MessageResult<T>,
}

pub async fn start(ip_addr: Ipv4Addr, port: u16, config: Arc<DerivedConfig>) -> anyhow::Result<()> {
    let client = reqwest::Client::builder()
        .timeout(time::Duration::from_secs(5 * 60))
        .build()
        .expect("could not initialize reqwest Client");
    let db_path = config.db_path.join("music.db");
    let db_exists = db_path.exists();
    let db = Db::new(format!("sqlite:{}?mode=rwc", db_path.to_string_lossy()))
        .await
        .expect("cannot connect to database");
    if !db_exists {
        db.init_tables().await.expect("could not init database");
        db.init_state().await.expect("could not init state");

        if let Some(mm) = config.musimanager.as_ref() {
            if mm.enable {
                db.init_musimanager_data(mm.db_path.as_path(), config.clone())
                    .await
                    .expect("could not init musimanager data");
            }
        }
    }

    let yti = FrontendClient::<YtiRequest>::new();
    let fe = FrontendClient::<FeRequest>::new();
    let state = AppState::new();
    let ytf = crate::yt::SongTubeFac::new(yti.clone(), client.clone(), config.clone());

    let options_route = warp::any().and(warp::options()).map(warp::reply).with(
        warp::cors()
            .allow_any_origin()
            .allow_header("content-type")
            .allow_methods(["POST", "GET"]),
    );

    use message_server::MessageServerRequest;

    let all = FrontendClient::client_ws_route(yti.clone(), "yti")
        .or(FrontendClient::client_ws_route(fe.clone(), "fec"))
        .or(FeRequest::cli_command_route(fe.clone(), "cli"))
        .or(AppState::app_state_handler_route(state.clone(), "app"))
        .or(DbRequest::routes(db.clone(), "db"))
        .or(ProxyRequest::cors_proxy_route(client.clone()))
        .or(mbz_routes(client.clone()))
        .or(source_path_route("to_path", config.clone()))
        .or(save_song_route("save_song", ytf.clone()))
        .or(image_route("image", client.clone(), config.clone()))
        .or(stream_yt("yt", ytf.clone()))
        .or(stream_file("file", config.clone()))
        .or(options_route.boxed());

    // #[cfg(build_mode = "DEV")]
    // let all = all.or(routes::redirect_route(client.clone(), config.clone()));

    #[cfg(feature = "native-player")]
    let all = all.or(server::player::player_route());

    let all = all.or(Asset::embedded_asset_route(config.clone()));
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

    let j = tokio::task::spawn(async move {
        let ytf = ytf;
        let db = db;
        let fec = fe;

        updater_system(ytf, fec, db).await;
    });

    println!("Starting server at {}:{}", ip_addr, port);

    let (_, fut) = warp::serve(all).try_bind_ephemeral((ip_addr, port))?;

    if config.run_in_background {
        fut.await;
    } else {
        tokio::select! {
            _ = fut => { },
            _ = state.wait() => { },
        }
    }

    j.abort();

    Ok(())
}

async fn _updater_system(
    ytf: crate::yt::SongTubeFac,
    fec: FrontendClient<FeRequest>,
    db: Db,
) -> anyhow::Result<()> {
    let _manager = covau_types::UpdateManager::new(ytf, fec, db);
    // manager.start().await?;
    Ok(())
}

async fn updater_system(ytf: crate::yt::SongTubeFac, fec: FrontendClient<FeRequest>, db: Db) {
    match _updater_system(ytf, fec, db).await {
        Ok(()) => (),
        Err(e) => {
            eprintln!("updater error: {}", e);
        }
    }
}

pub fn dump_types(config: &specta::ts::ExportConfiguration) -> anyhow::Result<String> {
    use crate::server::{db::*, player::*, routes::*};

    let mut types = String::new();
    types += "import type { DbMetadata, DbItem, Typ, SearchQuery } from '$types/db.ts';\n";
    types += "\n";
    types += &specta::ts::export::<Message<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<MessageResult<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<FeRequest>(config)?;
    types += ";\n";
    types += &specta::ts::export::<AppMessage>(config)?;
    types += ";\n";
    types += &specta::ts::export::<PlayerCommand>(config)?;
    types += ";\n";
    types += &specta::ts::export::<PlayerMessage>(config)?;
    types += ";\n";
    types += &specta::ts::export::<ProxyRequest>(config)?;
    types += ";\n";
    types += &specta::ts::export::<InsertResponse<()>>(config)?;
    types += ";\n";
    types += &specta::ts::export::<YtStreamQuery>(config)?;
    types += ";\n";
    types += &specta::ts::export::<ImageQuery>(config)?;
    types += ";\n";
    types += &specta::ts::export::<DbRequest>(config)?;
    types += ";\n";
    types += &specta::ts::export::<ErrorMessage>(config)?;
    types += ";\n";

    Ok(types)
}
