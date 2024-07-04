import type { ErrorMessage, Message, FeRequest } from '$types/server.ts';
import { toast } from './toast/toast.ts';
import * as St from "$lib/searcher/song_tube.ts";
import * as yt from "$types/yt.ts";
import { exhausted } from './virtual.ts';

export const utils = {
    async api_request<P, T>(url: string, json_payload: P) {
        let res = await fetch(
            url,
            {
                method: "POST",
                body: JSON.stringify(json_payload),
                headers: { "Content-Type": "application/json" },
            }
        );
        // console.log(res);

        let body = await res.text();

        if (!res.ok) {
            let err: ErrorMessage = JSON.parse(body);
            console.error(err.stack_trace);
            throw new Error(err.message);
        }

        let resp: T = JSON.parse(body);
        // console.log(resp);
        return resp;
    },

    async api_request_no_resp<P, T>(url: string, json_payload: P) {
        let res = await fetch(
            url,
            {
                method: "POST",
                body: JSON.stringify(json_payload),
                headers: { "Content-Type": "application/json" },
            }
        );
        // console.log(res);

        let body = await res.text();

        if (!res.ok) {
            let err: ErrorMessage = JSON.parse(body);
            console.error(err.stack_trace);
            throw new Error(err.message);
        }
    },
};

abstract class Server<Req> {
    ws: WebSocket;

    constructor(path: string) {
        this.ws = new WebSocket(`ws://localhost:${import.meta.env.SERVER_PORT}/${path}`);

        this.ws.addEventListener('message', async (e) => {
            let mesg: Message<Req> = JSON.parse(e.data);
            console.log(mesg)

            if (mesg.type === "Err") {
                toast(mesg.content, "error");
                return;
            }

            let resp;
            try {
                resp = await this.handle_req(mesg.content);
            } catch (e: any) {
                let err: string;
                if (e instanceof Error) {
                    err = e.message;
                } else {
                    err = JSON.stringify(e);
                }
                let resp_mesg: Message<Object | null> = {
                    type: "Err",
                    id: mesg.id,
                    content: err,
                };

                console.log(resp_mesg);
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

    // don't return anything if no response
    // return null for () unit type
    // else some { object: () }
    // NOTE: server will wait forever if it expects a response and one is not sent.
    //       maybe just make a "null" response as a precaution??
    abstract handle_req(req: Req): Promise<Object | null | undefined>;
}

class YtiServer extends Server<yt.YtiRequest> {
    constructor() {
        super("serve/yti");
    }

    tubes: Map<string, St.SongTube> = new Map();
    async handle_req(req: yt.YtiRequest): Promise<Object | null | undefined> {
        switch (req.type) {
            case 'CreateSongTube': {
                let tube = new St.SongTube(req.content.query);
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
    }
}

class FeServer extends Server<FeRequest> {
    constructor() {
        super("serve/fec");
    }

    async handle_req(req: FeRequest): Promise<Object | null | undefined> {
        switch (req.type) {
            case 'Notify': {
                toast(req.content, "info");
                return null;
            } break;
            case 'NotifyError': {
                toast(req.content, "error");
                return null;
            } break;
            case 'Like':
            case 'Dislike':
            case 'Next':
            case 'Prev':
            case 'Pause':
            case 'Play':
            case 'ToggleMute':
            case 'TogglePlay':
            default:
                throw exhausted(req);
        }
    }
}

export let ytiserver: YtiServer | null = null;
export let feserver: FeServer | null = null;
export const serve = async () => {
    ytiserver = new YtiServer();
    feserver = new FeServer();

    // let tube = get(stores.tube);
    // let res = await tube.music.search("Aimer", { type: 'video' });
    // console.log(res)
    // let contents = res.contents!
    //     .flatMap(e => e.contents?.filterType(St.YTNodes.MusicResponsiveListItem) ?? []);
    // let i = contents[0];
    // console.log(await tube.music.getInfo(i.id!))
    // console.log(i)

    // let a = await tube.music.getArtist(i.id!);
    // console.log(a);
    // let songs = await a.getAllSongs();
    // console.log(songs);
    // let playlist = await tube.music.getPlaylist(songs?.playlist_id!);
    // console.log(playlist)
    // // console.log(tube.music.getAlbum())
    // // console.log(await a.sections[2].as(St.YTNodes.MusicCarouselShelf).header?.more_content?.endpoint.call());
    // let channel = await tube.getChannel(i.id!);
    // console.log(channel)
};
