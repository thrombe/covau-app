import type { ErrorMessage, Message, FeRequest, MessageResult } from '$types/server.ts';
import { toast } from './toast/toast.ts';
import * as st from "$lib/searcher/song_tube.ts";
import * as yt from "$types/yt.ts";
import { exhausted } from './utils.ts';
import * as types from "$types/types.ts";
import * as stores from "$lib/stores.ts";
import { get } from 'svelte/store';
import { err_msg, buffer_to_base64 } from './utils.ts';

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

    url: {
        stream: {
            file(query: types.covau.SourcePath) {
                let url = new URL(utils.base_url + "stream/file");
                Object.entries(query).forEach(([k, v]) => {
                    url.searchParams.append(k, v);
                });
                return url.toString();
            },
            yt(query: types.server.YtStreamQuery) {
                let url = new URL(utils.base_url + "stream/yt");
                Object.entries(query).forEach(([k, v]) => {
                    url.searchParams.append(k, v.toString());
                });
                return url.toString();
            },
        },
        fetch: {
            image(query: types.server.ImageQuery) {
                let url = new URL(utils.base_url + "image");
                Object.entries(query).forEach(([k, v]) => {
                    url.searchParams.append(k, v);
                });
                return url.toString();
            },
        },
    },
};
export const api = {
    async to_path(path: types.covau.SourcePath) {
        let p: string = await utils.api_request(utils.base_url + "to_path", path);
        return p;
    },
    async save_song(id: string) {
        let path: types.covau.SourcePath = await utils.api_request(utils.base_url + "save_song", id);
        return path;
    },
};


type Resolved = { readonly _tag: "RESOLVED" };
type ResolveOps = {
    none: () => Resolved,
    unit: () => Resolved,
    one: (r: Object | null) => Resolved,
    many: (r: Object | null) => void,
    many_done: (r: Object | null) => Resolved,
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
            if (mesg.type != "Request") {
                let err = JSON.stringify(mesg);
                toast(err, "error");
                console.error(err);
                return;
            }

            let self = this;
            const resolved: Resolved = { _tag: "RESOLVED" };
            let index = 0;
            let resolve: ResolveOps = {
                none() {
                    return resolved;
                },
                unit() {
                    let resp_mesg: Message<string> = {
                        type: "OkOne",
                        id: mesg.id,
                        content: JSON.stringify(null),
                    };
                    
                    console.log(resp_mesg);
                    self.ws.send(JSON.stringify(resp_mesg));
                    return resolved;
                },
                one(resp: Object | null) {
                    let resp_mesg: Message<string> = {
                        type: "OkOne",
                        id: mesg.id,
                        content: JSON.stringify(resp),
                    };

                    console.log(resp_mesg);
                    self.ws.send(JSON.stringify(resp_mesg));
                    return resolved;
                },
                many(resp: Object | null) {
                    let resp_mesg: Message<string> = {
                        type: "OkMany",
                        id: mesg.id,
                        content: { data: JSON.stringify(resp), index, done: false },
                    };
                    index += 1;

                    console.log(resp_mesg);
                    self.ws.send(JSON.stringify(resp_mesg));
                },
                many_done(resp: Object | null) {
                    let resp_mesg: Message<string> = {
                        type: "OkMany",
                        id: mesg.id,
                        content: { data: JSON.stringify(resp), index, done: true },
                    };
                    index += 1;

                    console.log(resp_mesg);
                    self.ws.send(JSON.stringify(resp_mesg));
                    return resolved;
                },
            };

            try {
                let _ = await this.handle_req(mesg.content, resolve);
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
    abstract handle_req(req: Req, resolve: ResolveOps): Promise<Resolved>;
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
    async handle_req(req: yt.YtiRequest, resolve: ResolveOps): Promise<Resolved> {
        switch (req.type) {
            case 'CreateSongTube': {
                let tube = new st.SongTube(req.content.query);
                this.tubes.set(req.content.id, tube);
                return resolve.unit();
            } break;
            case 'DestroySongTube': {
                this.tubes.delete(req.content.id);
                return resolve.unit();
            } break;
            case 'NextPageSongTube': {
                let tube = this.tubes.get(req.content.id)!;
                let page = await tube.next_page();
                let res: yt.SearchResults<yt.MusicListItem> = {
                    items: page,
                    has_next_page: tube.has_next_page,
                };
                return resolve.one(res);
            } break;
            case 'GetSongUri': {
                let uri = await st.st.fetch.try_uri(req.content.id);
                return resolve.one(uri);
            } break;
            case 'GetSongBytes': {
                await st.st.fetch.song_bytes_chunked(req.content.id, async bytes => {
                    let base64 = buffer_to_base64(bytes);
                    resolve.many(base64);
                });
                return resolve.many_done("");
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

    async handle_req(req: FeRequest, resolve: ResolveOps): Promise<Resolved> {
        switch (req.type) {
            case 'Notify': {
                toast(req.content, "info");
                return resolve.unit();
            } break;
            case 'NotifyError': {
                toast(req.content, "error");
                return resolve.unit();
            } break;
            case 'Like': {
                let item = get(stores.playing_item);
                let res = await item.dislike();
                stores.playing_item.update(t => t);
                if (!res) {
                    toast(`could not like "${item.title()}"`, "error")
                }
                return resolve.unit();
            } break;
            case 'Dislike': {
                let item = get(stores.playing_item);
                let res = await item.dislike();
                stores.playing_item.update(t => t);
                if (!res) {
                    toast(`could not dislike "${item.title()}"`, "error")
                }
                return resolve.unit();
            } break;
            case 'Next': {
                await get(stores.queue).play_next();
                stores.queue.update(t => t);
                return resolve.unit();
            } break;
            case 'Prev': {
                await get(stores.queue).play_prev();
                stores.queue.update(t => t);
                return resolve.unit();
            } break;
            case 'Pause': {
                get(stores.player).pause();
                stores.player.update(t => t);
                return resolve.unit();
            } break;
            case 'Play': {
                get(stores.player).unpause();
                stores.player.update(t => t);
                return resolve.unit();
            } break;
            case 'ToggleMute': {
                get(stores.player).toggle_mute();
                stores.player.update(t => t);
                return resolve.unit();
            } break;
            case 'TogglePlay': {
                get(stores.player).toggle_pause();
                stores.player.update(t => t);
                return resolve.unit();
            } break;
            case 'BlacklistArtists': {
                let item = stores.queue_ops.get_current_item();
                await stores.queue_ops.blacklist_artists(item);
                stores.player.update(t => t);
                return resolve.unit();
            } break;
            case 'RemoveAndNext': {
                let item = stores.queue_ops.get_current_item();
                stores.queue_ops.remove_item(item);
                stores.player.update(t => t);
                return resolve.unit();
            } break;
            case 'SeekFwd': {
                get(stores.player).seek_by(10);
                stores.player.update(t => t);
                return resolve.unit();
            } break;
            case 'SeekBkwd': {
                get(stores.player).seek_by(-10);
                stores.player.update(t => t);
                return resolve.unit();
            } break;
            default:
                throw exhausted(req);
        }
    }
}

type Resolver<T> = (res: T) => void;
class Client<Req> {
    ws: WebSocket;
    new_id_path: string;

    protected wait: Promise<void>;
    protected constructor(path: string) {
        this.new_id_path = utils.base_url + path + "/new_id";
        this.ws = new WebSocket(`ws://localhost:${import.meta.env.SERVER_PORT}/${path}`);

        this.ws.addEventListener('message', async (e) => {
            let mesg: Message<string> = JSON.parse(e.data);

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

    resolves: Map<number, Resolver<MessageResult<string>>> = new Map();
    async execute<T>(req: Req, id: number | null = null, allow_many: boolean = false): Promise<T> {
        if (id == null) {
            id = await utils.api_request(this.new_id_path, null) as number;
        }

        // @ts-ignore
        let resolve: Resolver<MessageResult<string>> = undefined;
        let promise = new Promise<MessageResult<string>>(r => {
            resolve = r;
        });
        this.resolves.set(id, resolve);

        let msg: Message<string> = {
            id: id,
            type: "Request",
            content: JSON.stringify(req),
        };
        this.ws.send(JSON.stringify(msg));
        let resp = await promise;

        if (resp.type == "Err") {
            console.error(resp.content.stack_trace);
            throw new Error(resp.content.message);
        } else if (resp.type == "OkMany" && allow_many) {
            return JSON.parse(resp.content.data);
        } else if (resp.type != "OkOne") {
            let data = JSON.stringify(resp.content);
            let msg = `expected 'OkOne' found '${resp.type}': ${data}`;
            console.error(msg);
            throw new Error(msg);
        }

        return JSON.parse(resp.content);
    }
}

export type AlmostDbItem<T> = Omit<Omit<types.db.DbItem<T>, "id">, "metadata">;
export type DbOps = ReturnType<DbClient["db_cud"]>;
export type DbUpdateCallback<T> = (item: types.db.DbItem<T>) => Promise<void>;

class DbClient extends Client<types.server.DbRequest> {
    def_id: number | null = null;

    protected constructor() {
        super("serve/db")
    }

    static async new() {
        let self = new DbClient();
        await self.wait;
        self.def_id = await utils.api_request(self.new_id_path, null);
        return self;
    }

    async new_id() {
        let id = await super.execute<number>({ type: "NewId" }, this.def_id, true);
        return id;
    }

    override async execute<T>(req: types.server.DbRequest): Promise<T> {
        let id = await this.new_id();
        return await super.execute(req, id);
    }

    listeners: Map<number, { enabled: boolean, callback: DbUpdateCallback<unknown> }[]> = new Map();
    set_update_listener<T>(id: number, callback: DbUpdateCallback<T>) {
        let handlers = this.listeners.get(id);

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
            // @ts-ignore
            handlers.push(handler);
        } else {
            // @ts-ignore
            this.listeners.set(id, [handler]);
        }

        return disable;
    }
    async call_listeners(item: types.db.DbItem<unknown>) {
        let listeners = this.listeners.get(item.id) ?? [];
        for (let listener of listeners) {
            if (listener.enabled) {
                let _promise = listener.callback(item).catch(e => {
                    let msg = err_msg(e);
                    toast(msg, "error");
                    console.error(e);
                });
                await _promise;
            }
        }
    }

    db_cud(id: number) {
        let self = this;
        return {
            id: id,

            async insert<T>(t: AlmostDbItem<T>): Promise<types.db.DbItem<T>> {
                let req: types.server.DbRequest = {
                    type: "Insert",
                    content: {
                        transaction_id: this.id,
                        typ: t.typ,
                        item: JSON.stringify(t.t),
                    },
                };
                let dbitem: types.db.DbItem<T> = await self.execute(req);
                return dbitem;
            },

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

                await self.call_listeners(dbitem);

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
                let mdata: types.db.DbMetadata = await self.execute(req);

                let new_item = { ...item, metadata: mdata };
                await self.call_listeners(new_item);

                return new_item;
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
}

export const db = {
    set_update_listener<T>(id: number, callback: DbUpdateCallback<T>) {
        return dbclient.set_update_listener(id, callback);
    },

    async txn<Ret>(fn: (db_ops: DbOps) => Promise<Ret>) {
        let id: number = await dbclient.execute({ type: "Begin" });
        try {
            let res = await fn(dbclient.db_cud(id));
            await dbclient.execute({ type: "Commit", content: id });
            return res;
        } catch (e: any) {
            await dbclient.execute({ type: "Rollback", content: id });

            throw e;
        }
    },

    async search<T>(typ: types.db.Typ, query: types.db.SearchQuery) {
        let res: types.db.SearchMatches<T> = await dbclient.execute({
            type: "Search",
            content: {
                typ,
                query,
            },
        });
        return res;
    },

    async get_by_refid<T>(typ: types.db.Typ, refid: string) {
        let res: types.db.DbItem<T> | null = await dbclient.execute({
            type: "GetByRefid",
            content: {
                typ,
                refid,
            },
        });
        return res;
    },

    async get_many_by_refid<T>(typ: types.db.Typ, refids: string[]) {
        let res: types.db.DbItem<T>[] = await dbclient.execute({
            type: "GetManyByRefid",
            content: {
                typ,
                refids,
            },
        });
        return res;
    },

    async get_by_id<T>(typ: types.db.Typ, id: number) {
        let res: types.db.DbItem<T> | null = await dbclient.execute({
            type: "GetById",
            content: {
                typ,
                id,
            },
        });
        return res;
    },

    async get_many_by_id<T>(typ: types.db.Typ, ids: number[]) {
        let res: types.db.DbItem<T>[] = await dbclient.execute({
            type: "GetManyById",
            content: {
                typ,
                ids,
            },
        });
        return res;
    },

    async get_untyped_by_id(id: number) {
        let res: types.db.DbItem<unknown> | null = await dbclient.execute({
            type: "GetUntypedById",
            content: {
                id,
            },
        });
        return res;
    },

    async get_many_untyped_by_id(ids: number[]) {
        let res: types.db.DbItem<unknown>[] = await dbclient.execute({
            type: "GetManyUntypedById",
            content: {
                ids,
            },
        });
        return res;
    },
};

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
