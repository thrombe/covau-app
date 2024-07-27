import type { ErrorMessage, Message, FeRequest, MessageResult } from '$types/server.ts';
import { toast } from './toast/toast.ts';
import * as st from "$lib/searcher/song_tube.ts";
import * as yt from "$types/yt.ts";
import { exhausted } from './utils.ts';
import * as types from "$types/types.ts";
import * as stores from "$lib/stores.ts";
import { get } from 'svelte/store';

export const utils = {
    base_url: `http://localhost:${import.meta.env.SERVER_PORT}/`,
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

    async api_request_no_resp<P>(url: string, json_payload: P) {
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

    protected wait: Promise<void>;
    protected constructor(path: string) {
        this.ws = new WebSocket(`ws://localhost:${import.meta.env.SERVER_PORT}/${path}`);

        this.ws.addEventListener('message', async (e) => {
            let mesg: Message<Req> = JSON.parse(e.data);
            console.log(mesg)

            if (mesg.type === "Err") {
                toast(mesg.content.message, "error");
                console.error(mesg.content.stack_trace);
                return;
            }

            let resp;
            try {
                resp = await this.handle_req(mesg.content);
            } catch (e: any) {
                console.error(e);
                let err: string;
                let trace: string;
                if (e instanceof Error) {
                    err = e.message;
                    trace = e.stack ?? err;
                } else {
                    err = JSON.stringify(e);
                    trace = JSON.stringify(e);
                }
                let resp_mesg: Message<Object | null> = {
                    type: "Err",
                    id: mesg.id,
                    content: {
                        message: err,
                        stack_trace: trace,
                    },
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

        let resolve: () => {};
        this.wait = new Promise(r => {
            resolve = r as () => {};
        });
        this.ws.addEventListener('open', async (_e) => {
            resolve();
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
    protected constructor() {
        super("serve/yti");
    }

    static async new() {
        let self = new YtiServer();
        await self.wait;
        return self;
    }

    tubes: Map<string, st.SongTube> = new Map();
    async handle_req(req: yt.YtiRequest): Promise<Object | null | undefined> {
        switch (req.type) {
            case 'CreateSongTube': {
                let tube = new st.SongTube(req.content.query);
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
            case 'GetSongUri': {
                return await st.st.fetch.try_uri(req.content.id);
            } break;
            default:
                throw exhausted(req);
        }
    }
}

class FeServer extends Server<FeRequest> {
    protected constructor() {
        super("serve/fec");
    }

    static async new() {
        let self = new FeServer();
        await self.wait;
        return self;
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
            case 'Like': {
                let item = get(stores.playing_item);
                let res = await item.dislike();
                stores.playing_item.update(t => t);
                if (!res) {
                    toast(`could not like "${item.title()}"`, "error")
                }
                return null;
            } break;
            case 'Dislike': {
                let item = get(stores.playing_item);
                let res = await item.dislike();
                stores.playing_item.update(t => t);
                if (!res) {
                    toast(`could not dislike "${item.title()}"`, "error")
                }
                return null;
            } break;
            case 'Next': {
                await get(stores.queue).play_next();
                stores.queue.update(t => t);
                return null;
            } break;
            case 'Prev': {
                await get(stores.queue).play_prev();
                stores.queue.update(t => t);
                return null;
            } break;
            case 'Pause': {
                get(stores.player).pause();
                stores.player.update(t => t);
                return null;
            } break;
            case 'Play': {
                get(stores.player).unpause();
                stores.player.update(t => t);
                return null;
            } break;
            case 'ToggleMute': {
                get(stores.player).toggle_mute();
                stores.player.update(t => t);
                return null;
            } break;
            case 'TogglePlay': {
                get(stores.player).toggle_pause();
                stores.player.update(t => t);
                return null;
            } break;
            default:
                throw exhausted(req);
        }
    }
}

type Resolver<T> = (res: any) => void;
class Client<Req> {
    ws: WebSocket;
    path: string;

    protected wait: Promise<void>;
    protected constructor(path: string) {
        this.path = utils.base_url + path + "/new_id";
        this.ws = new WebSocket(`ws://localhost:${import.meta.env.SERVER_PORT}/${path}`);

        this.ws.addEventListener('message', async (e) => {
            let mesg: Message<unknown> = JSON.parse(e.data);

            if (mesg.id == null) {
                toast("backend sent some data without id", "error");
                console.error(mesg.content);
                return;
            }

            let resolver = this.resolves.get(mesg.id) ?? null;
            if (resolver == null) {
                toast("backend sent some data with unknown id", "error");
                console.error(mesg.content);
                return;
            }
            this.resolves.delete(mesg.id);

            resolver(mesg);
        });

        let resolve: () => {};
        this.wait = new Promise(r => {
            resolve = r as () => {};
        });
        this.ws.addEventListener('open', async (_e) => {
            resolve();
        });
    }

    resolves: Map<number, Resolver<string>> = new Map();
    async execute<T>(req: Req): Promise<T> {
        let id: number = await utils.api_request(this.path, null);

        let resolve: Resolver<string> = undefined as unknown as Resolver<string>;
        let promise = new Promise<MessageResult<string>>(r => {
            resolve = r;
        });
        this.resolves.set(id, resolve);

        let msg: Message<string> = {
            id: id,
            type: "Ok",
            content: JSON.stringify(req),
        };
        this.ws.send(JSON.stringify(msg));
        let resp = await promise;

        if (resp.type == "Err") {
            console.error(resp.content.stack_trace);
            throw new Error(resp.content.message);
        }

        return JSON.parse(resp.content);
    }
}

export type AlmostDbItem<T> = Omit<Omit<types.db.DbItem<T>, "id">, "metadata">;
export type DbOps = ReturnType<DbClient["db_cud"]>;

class DbClient extends Client<types.server.DbRequest> {
    protected constructor() {
        super("serve/db")
    }

    static async new() {
        let self = new DbClient();
        await self.wait;
        return self;
    }

    db_cud(id: number) {
        let self = this;
        return {
            id: id,

            async insert_or_get<T>(t: AlmostDbItem<T>): Promise<types.server.InsertResponse<types.db.DbItem<T>>> {
                let req: types.server.DbRequest = {
                    type: "InsertOrGet",
                    content: {
                        transaction_id: this.id,
                        typ: t.typ,
                        item: JSON.stringify(t.t),
                    },
                };
                let dbitem: types.server.InsertResponse<types.db.DbItem<T>> = await self.execute(req);
                return dbitem;
            },

            async update<T>(item: types.db.DbItem<T>) {
                let req: types.server.DbRequest = {
                    type: "Update",
                    content: {
                        transaction_id: this.id,
                        item: {
                            ...item,
                            t: JSON.stringify(item.t),
                        },
                    },
                };
                let dbitem: types.db.DbItem<T> = await self.execute(req);
                return dbitem;
            },

            async update_metadata<T>(item: types.db.DbItem<T>) {
                let req: types.server.DbRequest = {
                    type: "UpdateMetadata",
                    content: {
                        transaction_id: this.id,
                        id: item.id,
                        typ: item.typ,
                        metadata: item.metadata,
                    },
                };
                let dbitem: types.db.DbMetadata = await self.execute(req);
                return dbitem;
            },

            async delete<T>(item: types.db.DbItem<T>) {
                let req: types.server.DbRequest = {
                    type: "Delete",
                    content: {
                        transaction_id: this.id,
                        item: JSON.stringify(item)
                    },
                };
                let _: null = await self.execute(req);
            },
        }
    }

    async txn<Ret>(fn: (db_ops: DbOps) => Promise<Ret>) {
        let id: number = await this.execute({ type: "Begin" });
        try {
            let res = await fn(this.db_cud(id));
            await this.execute({ type: "Commit", content: id });
            return res;
        } catch (e: any) {
            await this.execute({ type: "Rollback", content: id });

            throw e;
        }
    }

    async search<T>(typ: types.db.Typ, query: types.db.SearchQuery) {
        let res: types.db.SearchMatches<T> = await this.execute({
            type: "Search",
            content: {
                typ,
                query,
            },
        });
        return res;
    }

    async get_by_refid<T>(typ: types.db.Typ, refid: string) {
        let res: types.db.DbItem<T> | null = await this.execute({
            type: "GetByRefid",
            content: {
                typ,
                refid,
            },
        });
        return res;
    }

    async get_many_by_refid<T>(typ: types.db.Typ, refids: string[]) {
        let res: types.db.DbItem<T>[] = await this.execute({
            type: "GetManyByRefid",
            content: {
                typ,
                refids,
            },
        });
        return res;
    }

    async get_by_id<T>(typ: types.db.Typ, id: number) {
        let res: types.db.DbItem<T> | null = await this.execute({
            type: "GetById",
            content: {
                typ,
                id,
            },
        });
        return res;
    }

    async get_many_by_id<T>(typ: types.db.Typ, ids: number[]) {
        let res: types.db.DbItem<T>[] = await this.execute({
            type: "GetManyById",
            content: {
                typ,
                ids,
            },
        });
        return res;
    }
}

const app_ops = {
    async send(state: types.server.AppMessage) {
        let route = utils.base_url + "app";

        await utils.api_request_no_resp(route, state);
    },
    async before_unload(e: BeforeUnloadEvent) {
        // e.preventDefault();
        // e.returnValue = '';
        await app_ops.send("Unload");
    },
    async load(e: Event | null) {
        await app_ops.send("Load");
        await app_ops.send("Visible");
    },
    async visibility_change(e: Event) {
        if (document.visibilityState === 'visible') {
            await app_ops.send("Visible");
        } else {
            await app_ops.send("NotVisible");
        }
    },
    async online(e: Event) {
        await app_ops.send("Online");
    },
    async offline(e: Event) {
        await app_ops.send("Offline");
    },
};

function app_hook() {
    window.addEventListener("load", app_ops.load);
    window.addEventListener("beforeunload", app_ops.before_unload);
    document.addEventListener("visibilitychange", app_ops.visibility_change);
    window.addEventListener("online", app_ops.online);
    window.addEventListener("offline", app_ops.offline);
}
function app_unhook() {
    window.removeEventListener("load", app_ops.load);
    window.removeEventListener("beforeunload", app_ops.before_unload);
    document.removeEventListener("visibilitychange", app_ops.visibility_change);
    window.removeEventListener("online", app_ops.online);
    window.removeEventListener("offline", app_ops.offline);
}

export let ytiserver: YtiServer | null = null;
export let feserver: FeServer | null = null;
// @ts-ignore
export let dbclient: DbClient = null;
export const serve = async () => {
    ytiserver = await YtiServer.new();
    feserver = await FeServer.new();
    dbclient = await DbClient.new();
    app_hook();
    await app_ops.load(null);

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
export const unserve = async () => {
    ytiserver = null;
    feserver = null;
    // @ts-ignore
    dbclient = null;
    app_unhook();
};
