
import { exhausted } from '$lib/utils.ts';
import * as types from "$types/types.ts";
import type { MessageHandler } from '$lib/stores.ts';
import type { ListItem } from '$lib/searcher/item.ts';
import { toast } from '$lib/toast/toast.ts';

type PlayerSyncedData = 'Initialised' | 'Finished' | 'Playing' | 'Paused' | "Unstarted";

export class YtPlayer {
    player_initialised: Promise<void>;
    player: YT.Player;

    synced_data: PlayerSyncedData;

    // TODO: also track buffered pos using this.player.getVideoLoadedFraction maybe??
    // player position in range 0..1
    // player_pos: number = 0;

    _is_playing: boolean = false;

    private constructor(video_element_id: string) {
        this.synced_data = 'Initialised';

        let initialised: (v: void) => void;
        this.player_initialised = new Promise(r => { initialised = r; });
        // this YT thing comes from the youtube iframe api script
        // - [youtube.d.ts File for the youtube-iframe-api](https://stackoverflow.com/questions/42352944/youtube-d-ts-file-for-the-youtube-iframe-api-to-use-in-angular-2-needed)
        this.player = new YT.Player(video_element_id, {
            width: 0,
            height: 0,
            playerVars: {
                color: 'white',
                controls: 0,
                // autoplay: 1,
                showinfo: 0,
                disablekb: 1,
                modestbranding: 1,
                enablejsapi: 1
            },
            events: {
                onReady: (eve: any) => {
                    this.player = eve.target;
                    initialised();
                },
                onStateChange: async (eve) => {
                    await this.handle_event(eve);
                }
            }
        });
    }

    interval: number = 0;
    static async new(video_element_id: string) {
        let player = new YtPlayer(video_element_id);

        await player.player_initialised;

        player.interval = setInterval(async () => {
            player.send_message({ type: "ProgressPerc", content: player.get_player_pos() });
        }, 300) as unknown as number;

        return player;
    }

    handlers: MessageHandler[] = [];
    on_message(callback: MessageHandler) {
        for (let h of this.handlers) {
            if (h == callback) {
                return;
            }
        }
        this.handlers.push(callback);
    }

    private async send_message(msg: types.server.PlayerMessage) {
        for (let handler of this.handlers) {
            await handler(msg);
        }
    }

    private async handle_event(eve: YT.OnStateChangeEvent) {
        console.log(eve);
        let pl = eve.target as any;
        if ("hideVideoInfo" in pl) {
            pl.hideVideoInfo();
        }
        switch (eve.data) {
            case YT.PlayerState.UNSTARTED: {
                if (this.synced_data !== "Unstarted") {
                    this._is_playing = false;
                    this.synced_data = "Unstarted";
                } else {
                    toast("could not play song", "error");
                }
            } break;
            case YT.PlayerState.ENDED: {
                await this.send_message({ type: "Finished" });
                this._is_playing = true;
                this.synced_data = "Finished";
            } break;
            case YT.PlayerState.PLAYING: {
                if (this._is_playing) {
                    await this.send_message({ type: "Playing", content: "" });
                } else {
                    await this.send_message({ type: "Unpaused" });
                }

                this._is_playing = true;
                this.synced_data = "Playing";

                let dur = this.get_duration();
                if (dur) {
                    await this.send_message({ type: "Duration", content: dur });
                }
            } break;
            case YT.PlayerState.PAUSED: {
                this._is_playing = false;
                this.synced_data = "Paused";
                await this.send_message({ type: "Paused" });
            } break;
            case YT.PlayerState.BUFFERING:
            case YT.PlayerState.CUED:
                break;
            default:
                throw exhausted(eve.data);
        }
    }

    // TODO: more consistent format for duration | position
    get_player_pos() {
        let curr_time = this.player.getCurrentTime();
        let duration = this.player.getDuration();
        let current_pos = curr_time / duration;

        if (typeof curr_time === 'undefined' || typeof duration === 'undefined' || duration == 0) {
            return 0;
        }
        // this.player_pos = current_pos;
        return current_pos;
    }

    get_duration() {
        let dur = this.player.getDuration();
        if (typeof dur === 'undefined' || dur === 0) {
            return null;
        } else {
            return dur;
        }
    }

    async destroy() {
        clearInterval(this.interval);
        this.player.destroy();
    }

    pause() {
        switch (this.synced_data) {
            case 'Playing': {
                this.player.pauseVideo();
            } break;
            case 'Initialised':
            case 'Finished':
            case 'Unstarted':
            case 'Paused': {
            } break;
            default:
                throw exhausted(this.synced_data);
        }
    }

    unpause() {
        this.play(null);
    }

    async play_item(item: ListItem) {
        let id = await item.yt_id();
        if (id) {
            this.play(id);
        } else {
            throw new Error("Musiplayer can't play this item");
        }
    }

    play(id: string | null = null) {
        switch (this.synced_data) {
            case 'Playing':
            case 'Finished':
            case 'Unstarted':
            case 'Initialised': {
                if (id) {
                    this.player.loadVideoById(id);
                } else {
                    // nothing ? :/
                }
                if (this.player.getPlayerState() != YT.PlayerState.PLAYING) {
                    this.player.playVideo();
                }
            } break;
            case 'Paused': {
                if (id) {
                    this.player.loadVideoById(id);
                } else {
                    if (this.player.getPlayerState() != YT.PlayerState.PLAYING) {
                        this.player.playVideo();
                    }
                }
            } break;
            default:
                throw exhausted(this.synced_data);
        }
    }

    seek_promise: Promise<void> = Promise.resolve();
    async seek_to_perc(perc: number) {
        // let pos = this.player.getCurrentTime();
        let duration = this.player.getDuration();
        this.player.seekTo(duration * perc, true);
    }

    toggle_pause() {
        console.log(this.synced_data)
        if (this.synced_data === 'Playing') {
            if (this.player.getPlayerState() == YT.PlayerState.UNSTARTED) {
                this.play();
            } else {
                this.pause();
            }
        } else if (this.synced_data === 'Paused') {
            this.play();
        } else {
            this.play();
        }
    }

    is_playing() {
        return this.synced_data === 'Playing' && this.player.getPlayerState() !== YT.PlayerState.UNSTARTED;
    }

    get_volume() {
        let vol = this.player.getVolume() / 100;
        return vol;
    }

    set_volume(t: number) {
        if (t > 1) {
            t = 1;
        } else if (t < 0) {
            t = 0;
        }
        this.player.setVolume(100 * t);

        this.send_message({ type: "Volume", content: this.get_volume() });
    }

    toggle_mute() {
        if (this.is_muted()) {
            this.unmute();
        } else {
            this.mute();
        }
    }

    is_muted() {
        return this.player.isMuted();
    }

    mute() {
        this.player.mute();
        this.send_message({ type: "Mute", content: true })
    }

    unmute() {
        this.player.unMute();
        this.send_message({ type: "Mute", content: false })
    }
}

let has_iframe = Promise.resolve(false);
export let init_api = async () => {
    if (await has_iframe) {
        return true;
    }

    let s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);

    let init_iframe: (b: boolean) => void;
    has_iframe = new Promise((r) => {
        init_iframe = r;
    });
    // [...document.getElementsByTagName('script')].forEach((e) => {
    //     if (e.src.includes('https://www.youtube.com/iframe_api')) {
    //         init_iframe(true);
    //     }
    // });
    (window as any).onYouTubeIframeAPIReady = async () => {
        init_iframe(true);
    };
    return await has_iframe;
};
