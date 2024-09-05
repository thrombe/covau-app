use futures::FutureExt;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::sync::Mutex;
use tokio_stream::wrappers::ReceiverStream;
use warp::filters::BoxedFilter;
use warp::ws;
use warp::ws::Ws;
use warp::Filter;
use warp::Reply;

#[cfg(feature="native-player")]
use crate::musiplayer::Player;

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

#[cfg(feature="native-player")]
async fn player_command_handler(
    msg: ws::Message,
    player: &Arc<Mutex<Player>>,
    tx: tokio::sync::mpsc::Sender<PlayerMessage>,
) -> anyhow::Result<()> {
    let Some(message) = msg.to_str().ok() else {
        return Ok(());
    };
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

#[cfg(feature="native-player")]
pub fn player_route() -> BoxedFilter<(impl Reply,)> {
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
                        let e = warp::ws::Message::text(serde_json::to_string(&e).unwrap());
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
                        Ok(msg) => match player_command_handler(msg, &player, tx.clone()).await {
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
                        },
                        Err(e) => {
                            eprintln!("Error: {}", &e);
                        }
                    }
                }

                let _ = player.lock().await.pause();
                j.abort();
                drop(tx);
                drop(wsrx);
                j2.abort();
                // let _  = j2.await;
            })
        });
    let route = route.with(warp::cors().allow_any_origin());

    route.boxed()
}
