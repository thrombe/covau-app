import { toast } from "$lib/toast/toast";
import { exhausted } from "$lib/virtual";
import type { PlayerMessage, PlayerCommand } from "$types/server";

type MessageHandler = ((msg: PlayerMessage) => Promise<void>) | ((msg: PlayerMessage) => void);

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

    constructor() {
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
        this.ws.addEventListener('open', async (_e) => {
            this.unmute();
            this.set_volume(1.0);
            this.seek_to_perc(0.0);
            this.pause();
        });
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
            handlers.push(handler);
        } else {
            this.listeners.set(type, [handler]);
        }

        return disable;
    }

    send_message(msg: PlayerCommand) {
        this.ws.send(JSON.stringify(msg));
    }

    play(uri: string | null = null) {
        if (uri === null) {
            this.unpause();
        } else {
            this.send_message({type: 'Play', content: uri });
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


