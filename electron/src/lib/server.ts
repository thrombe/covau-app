import type { Message } from '$types/server';
import { toast } from './toast/toast';
import * as stores from "$lib/stores.ts";
import { get } from 'svelte/store';
import * as St from "$lib/searcher/song_tube.ts";
import * as yt from "$types/yt.ts";
import { exhausted } from './virtual';
import type Innertube from 'youtubei.js';

class Server {
    ws: WebSocket;
    tube: Innertube;

    constructor() {
        this.ws = new WebSocket(`ws://localhost:${import.meta.env.SERVER_PORT}/serve`);
        this.tube = get(stores.tube);

        this.ws.addEventListener('message', async (e) => {
            let mesg: Message<yt.YtiRequest> = JSON.parse(e.data);
            console.log(mesg)

            if (mesg.type === "Err") {
                toast(mesg.content, "error");
                return;
            }

            let resp;
            try {
                resp = await this.handle_req(mesg.content);
            } catch (e: any) {
                let resp_mesg: Message<Object | null> = {
                    type: "Err",
                    id: mesg.id,
                    content: e,
                };

                this.ws.send(JSON.stringify(resp_mesg));
            }

            if (typeof resp === "undefined") {
                return;
            }

            let resp_mesg: Message<string> = {
                type: "Ok",
                id: mesg.id,
                content: JSON.stringify(resp),
            };

            console.log(resp_mesg);
            this.ws.send(JSON.stringify(resp_mesg));
        });
    }

    tubes: Map<string, St.SongTube> = new Map();
    // don't return anything if no response
    // return null for () unit type
    // else some { object: () }
    async handle_req(req: yt.YtiRequest): Promise<Object | null | undefined> {
        switch (req.type) {
            case 'CreateSongTube': {
                let tube = new St.SongTube(req.content.query, this.tube);
                this.tubes.set(req.content.id, tube);
                return null;
            } break;
            case 'DestroySongTube': {
                this.tubes.delete(req.content.id);
                return null;
            } break;
            case 'NextPageSongTube': {
                let tube = this.tubes.get(req.content.id)!;
                let page = await tube.next_page();
                let res: yt.SearchResults<yt.MusicListItem> = {
                    items: page,
                    has_next_page: tube.has_next_page,
                };
                return res;
            } break;
            default:
                throw exhausted(req);
        }
        return {};
    }
}

export let server: Server | null = null;
export const serve = async () => {
    server = new Server();
};
