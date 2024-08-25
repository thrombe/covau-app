import { exhausted } from "$lib/utils.ts";
import type { PlayerMessage, PlayerCommand } from "$types/server.ts";
import type { MessageHandler, Player } from "$lib/stores.ts";
import type { ListItem } from "$lib/searcher/item.ts";
import * as server from "$lib/server.ts";
import * as types from "$types/types.ts";
import * as st from "$lib/searcher/song_tube.ts";

export class Audioplayer implements Player {
    finished: boolean = false;
    listeners: Map<string, { enabled: boolean, callback: MessageHandler }[]>;

    audio: HTMLAudioElement;

    private constructor(id: string) {
        this.listeners = new Map();

        let audio = document.getElementById(id);
        if (audio == null) {
            throw new Error(`Could not find element with id '${id}'`);
        }
        if (!(audio instanceof HTMLAudioElement)) {
            throw new Error(`Element with id '${id}' is not of class 'HTMLAudioELement'`);
        }
        this.audio = audio;

        this.audio.addEventListener("timeupdate", () => {
            this.send_message({ type: "ProgressPerc", content: this.get_progress() });
        });
        this.audio.addEventListener("durationchange", () => {
            this.send_message({ type: "Duration", content: this.get_duration() });
        });
        this.audio.addEventListener("loadeddata", () => {
            this.send_message({ type: "Duration", content: this.get_duration() });
        });
        this.audio.addEventListener("playing", () => {
            this.send_message({ type: "Duration", content: this.get_duration() });
        });
        this.audio.addEventListener("ended", () => {
            this.finished = true;
            this.send_message({ type: "Finished" });
        });
        this.audio.addEventListener("volumechange", () => {
            this.send_message({ type: "Volume", content: this.audio.volume });
        });
        this.audio.addEventListener("seeked", () => {
            this.send_message({ type: "ProgressPerc", content: this.get_progress() });
        });
        // this.audio.addEventListener("progress", () => { });
    }

    static async new(id: string) {
        let pl = new Audioplayer(id);

        return pl;
    }

    add_message_listener(type: PlayerMessage['type'] | "any", callback: MessageHandler) {
        let handlers = this.listeners.get(type);

        let handler = {
            enabled: true,
            callback,
        };

        // TODO: remove these from handlers instead of just disabling
        let disable = () => {
            handler.enabled = false;
        };

        if (handlers) {
            for (let h of handlers) {
                if (h.callback == callback) {
                    return disable;
                }
            }
            handlers.push(handler);
        } else {
            this.listeners.set(type, [handler]);
        }

        return disable;
    }

    get_progress() {
        // triggers when duration is NaN
        if (this.audio.duration !== this.audio.duration) {
            return 0;
        }
        return this.audio.currentTime / this.audio.duration;
    }

    protected get_duration() {
        // triggers when duration is NaN
        if (this.audio.duration !== this.audio.duration) {
            return 0;
        }
        return this.audio.duration;
    }

    async destroy() { }

    on_message(callback: MessageHandler) {
        this.add_message_listener("any", callback);
    }

    send_message(message: PlayerMessage) {
        let handlers = this.listeners.get(message.type);
        if (handlers) {
            for (let handler of handlers) {
                if (handler.enabled) {
                    handler.callback(message);
                }
            }
        }
        handlers = this.listeners.get("any");
        if (handlers) {
            for (let handler of handlers) {
                if (handler.enabled) {
                    handler.callback(message);
                }
            }
        }
    }

    send_command(message: PlayerCommand) {
        let _promise = (async () => {
            switch (message.type) {
                case "Play": {
                    this.finished = false;
                    this.send_message({ type: "Playing", content: message.content });
                } break;
                case "Pause": {
                    this.audio.pause();
                    this.send_message({ type: "Paused" });
                } break;
                case "Unpause": {
                    await this.audio.play();
                    this.send_message({ type: "Unpaused" });
                } break;
                case "SeekBy": {
                    let progress = this.audio.currentTime + message.content;
                    this.audio.currentTime = progress;
                    this.send_message({ type: "ProgressPerc", content: progress / this.get_duration() });
                } break;
                case "SeekToPerc": {
                    this.audio.currentTime = this.get_duration() * message.content;
                    this.send_message({ type: "ProgressPerc", content: message.content });
                } break;
                case "Mute": {
                    this.audio.muted = true;
                    this.send_message({ type: "Mute", content: true });
                } break;
                case "Unmute": {
                    this.audio.muted = false;
                    this.send_message({ type: "Mute", content: false });
                } break;
                case "IsMuted": {
                    this.send_message({ type: "Mute", content: this.audio.muted });
                } break;
                case "GetVolume": {
                    this.send_message({ type: "Volume", content: this.audio.volume });
                } break;
                case "SetVolume": {
                    this.audio.volume = message.content;
                    this.send_message({ type: "Volume", content: message.content });
                } break;
                case "GetDuration": {
                    this.send_message({ type: "Duration", content: this.get_duration() });
                } break;
                default:
                    throw exhausted(message);
            }
        })()
    }

    is_playing() {
        return !this.audio.paused;
    }

    is_finished() {
        return this.finished;
    }

    async play_item(item: ListItem) {
        let src = item.source_path();
        if (src) {
            this.audio.src = server.utils.url.stream.file(src);
            await this.audio.play();
            this.send_command({ type: "Play", content: src.path });
            return;
        }

        let id = await item.yt_id();
        if (id) {
            let info = await st.st.fetch.uri(id);
            if (info != null) {
                let src: types.server.YtStreamQuery = {
                    id: id,
                    size: info.content_length,
                };
                this.audio.src = server.utils.url.stream.yt(src);
                await this.audio.play();
                this.send_command({ type: "Play", content: id });
                return;
            }
        }

        throw new Error("Audioplayer can't play this item");
    }

    toggle_pause() {
        if (this.audio.paused) {
            this.unpause();
        } else {
            this.pause();
        }
    }

    mute() {
        this.send_command({ type: 'Mute' });
    }

    unmute() {
        this.send_command({ type: 'Unmute' });
    }

    toggle_mute() {
        if (this.audio.muted) {
            this.unmute();
        } else {
            this.mute();
        }
    }

    pause() {
        this.send_command({ type: 'Pause' });
    }

    unpause() {
        this.send_command({ type: 'Unpause' });
    }

    seek_to_perc(t: number) {
        this.send_command({ type: 'SeekToPerc', content: t });
    }

    seek_by(s: number) {
        this.send_command({ type: 'SeekBy', content: s });
    }

    set_volume(v: number) {
        this.send_command({ type: 'SetVolume', content: v });
    }
}


