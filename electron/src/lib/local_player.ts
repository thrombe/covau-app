import { YTNodes } from "./searcher/song_tube";
import { new_innertube_instance } from "./searcher/tube";
import type { PlayerMessage, PlayerCommand } from "$types/server";

type MessageHandler = ((msg: PlayerMessage) => Promise<void>) | ((msg: PlayerMessage) => void);

export class LocalPlayer {

    ws: WebSocket;
    playing: string = '';
    paused: boolean = false;
    finished: boolean = false;
    progress: number = 0.0;
    duration: number = 0.0;
    volume: number = 1.0;
    listeners: Map<string, MessageHandler[]>;

    constructor() {
        this.listeners = new Map();
        this.ws = new WebSocket("ws://localhost:10010/player");
        this.ws.addEventListener('message', async (e) => {
            let message: PlayerMessage = JSON.parse(e.data);

            let handlers = this.listeners.get(message.type);
            if (handlers) {
                for (let handler of handlers) {
                    handler(message);
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
                default:
                    console.warn("unhandled message: " + e.data);
                    break;
            }
        });
        this.ws.addEventListener('open', async (_e) => {
            // let p = await new_innertube_instance();
            // let res = await p.music.search("Imagine dragons", { type: 'song' });
            // console.log(res)
            // let contents = res.contents!
            //     .flatMap(e => e.contents?.filterType(YTNodes.MusicResponsiveListItem) ?? []);
            // let v = contents[0];
            // console.log(v)

            // let d = await p.getInfo(v.id!);
            // console.log(d)
            // let f = d.chooseFormat({ type: 'audio', quality: 'best', format: 'opus', client: 'YTMUSIC_ANDROID' });
            // let url = d.getStreamingInfo();
            // let uri = f.decipher(p.session.player);
            // console.log(url, url, f, uri)

            // this.send_message({ type: 'Play', content: uri });

            this.send_message({ type: 'SetVolume', content: 1.0 });
            this.send_message({ type: 'Pause' });
        });
    }

    add_message_listener(type: PlayerMessage['type'], handler: MessageHandler) {
        let handlers = this.listeners.get(type);
        if (handlers) {
            handlers.push(handler);
        } else {
            this.listeners.set(type, [handler]);
        }
    }

    send_message(msg: PlayerCommand) {
        this.ws.send(JSON.stringify(msg));
    }

    play(uri: string | null = null) {
        if (uri === null) {
            this.send_message({ type: 'Unpause' });
        } else {
            this.send_message({type: 'Play', content: uri });
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


