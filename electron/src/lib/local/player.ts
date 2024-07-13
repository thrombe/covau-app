import { toast } from "$lib/toast/toast.ts";
import { exhausted } from "$lib/virtual.ts";
import type { PlayerMessage, PlayerCommand } from "$types/server.ts";
import type { MessageHandler } from "$lib/stores.ts";
import type { ListItem } from "$lib/searcher/item.ts";

export class Musiplayer {
    ws: WebSocket;
    playing: string = '';
    paused: boolean = false;
    finished: boolean = false;
    progress: number = 0.0;
    duration: number = 0.0;
    volume: number = 1.0;
    listeners: Map<string, { enabled: boolean, callback: MessageHandler }[]>;
    muted: boolean = false;

    private wait: Promise<void>;
    private closed: Promise<void>;
    private constructor() {
        this.listeners = new Map();
        this.ws = new WebSocket(`ws://localhost:${import.meta.env.SERVER_PORT}/player`);
        this.ws.addEventListener('message', async (e) => {
            let message: PlayerMessage = JSON.parse(e.data);

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

            switch (message.type) {
                case 'Duration':
                    this.duration = message.content;
                    break;
                case 'Paused':
                    this.paused = true;
                    break;
                case 'Unpaused':
                    this.paused = false;
                    break;
                case 'Playing':
                    this.paused = false;
                    this.finished = false;
                    this.playing = message.content;
                    break;
                case 'ProgressPerc':
                    this.progress = message.content;
                    break;
                case 'Volume':
                    this.volume = message.content;
                    break;
                case 'Finished':
                    this.finished = true;
                    break;
                case 'Mute':
                    this.muted = message.content;
                    break
                case "Error":
                    toast(message.content, "error");
                    break;
                default:
                    throw exhausted(message);
            }
        });

        let resolve: () => {};
        this.wait = new Promise(r => {
            resolve = r as () => {};
        });
        this.ws.addEventListener('open', async (_e) => {
            resolve();
            this.unmute();
            this.set_volume(1.0);
            this.seek_to_perc(0.0);
            this.pause();
        });

        let close_resolve: () => {};
        this.closed = new Promise(r => {
            close_resolve = r as () => {};
        });
        this.ws.addEventListener("close", async (e) => {
            close_resolve();
        });
    }

    static async new() {
        let pl = new Musiplayer();
        await pl.wait;
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

    async destroy() {
        this.ws.close(1000);
        await this.closed;
    }

    is_playing() {
        return !this.paused && !this.finished && this.playing !== "";
    }

    on_message(callback: MessageHandler) {
        this.add_message_listener("any", callback);
    }

    send_message(msg: PlayerCommand) {
        this.ws.send(JSON.stringify(msg));
    }

    async play_item(item: ListItem) {
        let uri = await item.audio_uri();
        if (uri) {
            this.play(uri);
        } else {
            throw new Error("Musiplayer can't play this item");
        }
    }

    play(uri: string | null = null) {
        if (uri === null) {
            this.unpause();
        } else {
            this.send_message({ type: 'Play', content: uri });
        }
    }

    toggle_pause() {
        if (this.paused) {
            this.unpause();
        } else {
            this.pause();
        }
    }

    mute() {
        this.send_message({ type: 'Mute' });
    }

    unmute() {
        this.send_message({ type: 'Unmute' });
    }

    toggle_mute() {
        if (this.muted) {
            this.unmute();
        } else {
            this.mute();
        }
    }

    pause() {
        this.send_message({ type: 'Pause' });
    }

    unpause() {
        this.send_message({ type: 'Unpause' });
    }

    seek_to_perc(t: number) {
        this.send_message({ type: 'SeekToPerc', content: t });
    }

    seek_by(s: number) {
        this.send_message({ type: 'SeekBy', content: s });
    }

    set_volume(v: number) {
        this.send_message({ type: 'SetVolume', content: v });
    }

    update_volume_async() {
        this.send_message({ type: 'GetVolume' });
    }

    update_duration_async() {
        this.send_message({ type: 'GetDuration' });
    }
}


