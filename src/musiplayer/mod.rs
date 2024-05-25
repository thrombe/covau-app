
// https://pyo3.rs/latest/
// https://docs.rs/pyo3/latest/pyo3/

use anyhow::Result;


#[cfg(any(all(feature = "player-gst", feature = "force"), all(any(target_os = "windows", target_os = "linux"), target_arch = "x86_64", not(feature = "force"))))]
pub mod gst_player;
#[cfg(any(all(feature = "player-gst", feature = "force"), all(any(target_os = "windows", target_os = "linux"), target_arch = "x86_64", not(feature = "force"))))]
use gst_player::{Player as InternalPlayer};

#[cfg(any(all(feature = "player-mpv", feature = "force"), all(target_os = "android", target_arch = "aarch64", not(feature = "force"))))]
pub mod mpv_player;
#[cfg(any(all(feature = "player-mpv", feature = "force"), all(target_os = "android", target_arch = "aarch64", not(feature = "force"))))]
use mpv_player::{Player as InternalPlayer};

#[cfg(feature = "player-libmpv")]
mod libmpv_player;
#[cfg(feature = "player-libmpv")]
use libmpv_player::{Player as InternalPlayer};

pub mod dummy_player {
    use anyhow::Result;
    use std::time;
    
    #[derive(Debug)]
    pub struct DummyPlayer {
        start_time: time::Instant,
        dur: f64,
    }
    impl super::MusiPlayer for DummyPlayer {
        fn new() -> Result<Self> {
            Ok(Self{
                start_time: time::Instant::now(),
                dur: 200.0,
            })
        }
        fn duration(&mut self) -> Result<f64> {
            Ok(self.dur)
        }
        fn is_finished(&mut self) -> Result<bool> {
            let t = time::Instant::now().duration_since(self.start_time).as_secs_f64();
            Ok(t > self.dur)
        }
        fn is_paused(&mut self) -> Result<bool> {
            Ok(false) // eh
        }
        fn play(&mut self, _: String) -> Result<()> {
            self.start_time = time::Instant::now();
            Ok(())
        }
        fn position(&mut self) -> Result<f64> {
            let t = time::Instant::now().duration_since(self.start_time).as_secs_f64();
            Ok(t)
        }
        fn progress(&mut self) -> Result<f64> {
            Ok(self.position()?/self.duration()?)
        }
        fn seek(&mut self, _: f64) -> Result<()> {
            Ok(()) // eh
        }
        fn stop(&mut self) -> Result<()> {
            Ok(()) // eh
        }
        fn toggle_pause(&mut self) -> Result<()> {
            Ok(()) // eh
        }
    }
}
// use dummy_player::DummyPlayer as InternalPlayer;

#[derive(Debug)]
pub struct Player {
    internal_player: InternalPlayer,
}


impl Player {
    pub fn new() -> Result<Self> {
        Ok(Self {internal_player: MusiPlayer::new()?})
    }
    pub fn duration(&mut self) -> Result<f64> {
        MusiPlayer::duration(&mut self.internal_player)
    }
    pub fn is_finished(&mut self) -> Result<bool> {
        MusiPlayer::is_finished(&mut self.internal_player)
    }
    pub fn is_paused(&mut self) -> Result<bool> {
        MusiPlayer::is_paused(&mut self.internal_player)
    }
    pub fn play(&mut self, url: String) -> Result<()> {
        MusiPlayer::play(&mut self.internal_player, url)
    }
    pub fn position(&mut self) -> Result<f64> {
        MusiPlayer::position(&mut self.internal_player)
    }
    pub fn progress(&mut self) -> Result<f64> {
        MusiPlayer::progress(&mut self.internal_player)
    }
    pub fn seek(&mut self, t: f64) -> Result<()> {
        MusiPlayer::seek(&mut self.internal_player, t)
    }
    pub fn stop(&mut self) -> Result<()> {
        MusiPlayer::stop(&mut self.internal_player)
    }
    pub fn toggle_pause(&mut self) -> Result<()> {
        MusiPlayer::toggle_pause(&mut self.internal_player)
    }
}

pub trait MusiPlayer
where Self:  Sized + 'static + Send + Sync
{
    fn new() -> Result<Self>;
    fn play(&mut self, url: String) -> Result<()>;
    fn stop(&mut self) -> Result<()>;
    fn toggle_pause(&mut self) -> Result<()>;
    fn seek(&mut self, t: f64) -> Result<()>;
    fn is_finished(&mut self) -> Result<bool>;
    fn is_paused(&mut self) -> Result<bool>;
    fn progress(&mut self) -> Result<f64>;
    fn position(&mut self) -> Result<f64>;
    fn duration(&mut self) -> Result<f64>;
}

