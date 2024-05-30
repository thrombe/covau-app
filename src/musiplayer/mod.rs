
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

#[derive(Debug)]
pub struct Player {
    internal_player: InternalPlayer,
}

// TODO: this should be an async abstraction that actually makes sure things happen
impl Player {
    pub fn new() -> Result<Self> {
        Ok(Self {internal_player: MusiPlayer::new()?})
    }
    pub fn play(&mut self, url: String) -> Result<()> {
        MusiPlayer::play(&mut self.internal_player, url)
    }
    pub fn stop(&mut self) -> Result<()> {
        MusiPlayer::stop(&mut self.internal_player)
    }
    pub fn toggle_pause(&mut self) -> Result<()> {
        MusiPlayer::toggle_pause(&mut self.internal_player)
    }
    pub fn pause(&mut self) -> Result<()> {
        MusiPlayer::pause(&mut self.internal_player)
    }
    pub fn unpause(&mut self) -> Result<()> {
        MusiPlayer::unpause(&mut self.internal_player)
    }
    pub fn get_volume(&mut self) -> Result<f64> {
        MusiPlayer::get_volume(&mut self.internal_player)
    }
    pub fn set_volume(&mut self, vol: f64) -> Result<()> {
        MusiPlayer::set_volume(&mut self.internal_player, vol)
    }
    pub fn seek_by(&mut self, t: f64) -> Result<()> {
        MusiPlayer::seek_by(&mut self.internal_player, t)
    }
    pub fn is_finished(&mut self) -> Result<bool> {
        MusiPlayer::is_finished(&mut self.internal_player)
    }
    pub fn is_paused(&mut self) -> Result<bool> {
        MusiPlayer::is_paused(&mut self.internal_player)
    }
    pub fn progress(&mut self) -> Result<f64> {
        MusiPlayer::progress(&mut self.internal_player)
    }
    pub fn position(&mut self) -> Result<f64> {
        MusiPlayer::position(&mut self.internal_player)
    }
    pub fn duration(&mut self) -> Result<f64> {
        MusiPlayer::duration(&mut self.internal_player)
    }
    pub fn seek_to_perc(&mut self, perc: f64) -> Result<()> {
        MusiPlayer::seek_to_perc(&mut self.internal_player, perc)
    }
    pub fn seek_to(&mut self, t: f64) -> Result<()> {
        MusiPlayer::seek_to(&mut self.internal_player, t)
    }
    pub fn mute(&mut self) -> Result<()> {
        MusiPlayer::mute(&mut self.internal_player)
    }
    pub fn unmute(&mut self) -> Result<()> {
        MusiPlayer::unmute(&mut self.internal_player)
    }
    pub fn is_muted(&mut self) -> Result<bool> {
        MusiPlayer::is_muted(&mut self.internal_player)
    }
}

pub trait MusiPlayer
where Self:  Sized + 'static + Send + Sync
{
    fn new() -> Result<Self>;
    fn play(&mut self, url: String) -> Result<()>;
    fn stop(&mut self) -> Result<()>;
    fn toggle_pause(&mut self) -> Result<()>;
    fn pause(&mut self) -> Result<()>;
    fn unpause(&mut self) -> Result<()>;
    /// [0, 1]
    fn get_volume(&mut self) -> Result<f64>;
    /// [0, 1]
    fn set_volume(&mut self, vol: f64) -> Result<()>;
    fn seek_by(&mut self, t: f64) -> Result<()>;
    fn is_finished(&mut self) -> Result<bool>;
    fn is_paused(&mut self) -> Result<bool>;
    /// [0, 1]
    fn progress(&mut self) -> Result<f64>;
    /// sec
    fn position(&mut self) -> Result<f64>;
    /// sec
    fn duration(&mut self) -> Result<f64>;

    fn seek_to_perc(&mut self, perc: f64) -> Result<()> {
        let dur = self.duration()?;
        let pos = self.position()?;
        self.seek_by(dur * perc - pos)
    }
    fn seek_to(&mut self, t: f64) -> Result<()> {
        let pos = self.position()?;
        let dur = self.duration()?;
        let pos = t - pos;
        self.seek_by(pos.max(0.0).min(dur))
    }
    fn mute(&mut self) -> Result<()>;
    fn unmute(&mut self) -> Result<()>;
    fn is_muted(&mut self) -> Result<bool>;
}

