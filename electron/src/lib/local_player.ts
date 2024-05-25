import { YTNodes } from "./searcher/song_tube";
import { new_innertube_instance } from "./searcher/tube";
import type { PlayerMessage } from "$types/server";


export class LocalPlayer {

    ws: WebSocket;

    constructor() {
        this.ws = new WebSocket("ws://localhost:10010/player");
        this.ws.addEventListener('message', async (e) => {
        });
        this.ws.addEventListener('open', async (e) => {
            let p = await new_innertube_instance();
            let res = await p.music.search("Milet", { type: 'song' });
            console.log(res)
            let contents = res.contents!
                .flatMap(e => e.contents?.filterType(YTNodes.MusicResponsiveListItem) ?? []);
            let v = contents[0];
            console.log(v)

            let d = await p.getInfo(v.id!);
            console.log(d)
            let f = d.chooseFormat({ type: 'audio', quality: 'best', format: 'opus', client: 'YTMUSIC_ANDROID' });
            let url = d.getStreamingInfo();
            let uri = f.decipher(p.session.player);
            console.log(url, url, f, uri)

            let msg: PlayerMessage = { type: 'Play', content: uri };
            this.ws.send(JSON.stringify(msg))
        });
    }

    async play() {

    }
}


