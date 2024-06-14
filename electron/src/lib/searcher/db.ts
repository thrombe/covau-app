import { SavedSearch, UniqueSearch, Unpaged } from "./mixins.ts";
import { type WrappedDb, type Keyed, type RObject, type RSearcher } from "./searcher.ts";
import * as Musi from "$types/musimanager.ts";
import * as yt from "$types/yt.ts";
import * as covau from "$types/covau.ts";
import * as server from "$types/server.ts";
import * as DB from "$types/db.ts";
import { exhausted } from "$lib/virtual.ts";
import { type Option, ListItem, type RenderContext } from "./item.ts";
import { toast } from "$lib/toast/toast.ts";
import * as stores from "$lib/stores.ts";
import { get, writable } from "svelte/store";
import { get_uri } from "./song_tube.ts";

export type MmSong = Musi.Song<Musi.SongInfo | null>;
export type MmAlbum = Musi.Album<Musi.SongId>;
export type MmArtist = Musi.Artist<Musi.SongId, Musi.AlbumId>;
export type MmPlaylist = Musi.Playlist<Musi.SongId>;
export type MmQueue = Musi.Queue<Musi.SongId>;

export type MusicListItem = Keyed & (
    | { id: number, typ: "MmSong", t: MmSong }
    | { id: number, typ: "MmAlbum", t: MmAlbum }
    | { id: number, typ: "MmArtist", t: MmArtist }
    | { id: number, typ: "MmPlaylist", t: MmPlaylist }
    | { id: number, typ: "MmQueue", t: MmQueue }
    | { id: number, typ: "StSong", t: yt.Song }
    | { id: number, typ: "StVideo", t: yt.Video }
    | { id: number, typ: "StAlbum", t: yt.Album }
    | { id: number, typ: "StPlaylist", t: yt.Playlist }
    | { id: number, typ: "StArtist", t: yt.Artist }
    | { id: number, typ: "Song", t: covau.Song }
    | { id: number, typ: "Playlist", t: covau.Playlist }
    | { id: number, typ: "Queue", t: covau.Queue }
    | { id: number, typ: "Updater", t: covau.Updater }
);

export type Typ = DB.Typ;
export type BrowseQuery =
    { query_type: 'search', type: Typ, query: string } |
    { query_type: 'refids', type: Typ, ids: string[] } |
    { query_type: 'ids', type: Typ, ids: number[] };

export class DbListItem extends ListItem {
    data: MusicListItem;

    constructor(data: MusicListItem) {
        super();
        this.data = data;
    }

    key(): unknown {
        return this.data.get_key();
    }

    title(): string {
        switch (this.data.typ) {
            case "MmSong":
                return this.data.t.title;
            case "MmAlbum":
                return this.data.t.name;
            case "MmArtist":
                return this.data.t.name;
            case "MmPlaylist":
                return this.data.t.name;
            case "MmQueue":
                return this.data.t.name;
            case "StSong":
                return this.data.t.title ?? this.data.t.id;
            case "StVideo":
                return this.data.t.title ?? this.data.t.id;
            case "StAlbum":
                return this.data.t.title ?? this.data.t.id;
            case "StPlaylist":
                return this.data.t.title ?? this.data.t.id;
            case "StArtist":
                return this.data.t.name ?? this.data.t.id;
            case "Song":
                return this.data.t.haystacks.at(0) ?? this.data.id.toString();
            case "Playlist":
                return this.data.t.title;
            case "Queue":
                return this.data.t.queue.title;
            case "Updater":
                return this.data.t.title;
            default:
                throw exhausted(this.data)
        }
    }

    thumbnail(): string | null {
        switch (this.data.typ) {
            case "MmSong":
                return this.data.t.info?.thumbnail_url ?? `https://i.ytimg.com/vi/${this.data.t.key}/maxresdefault.jpg`;
            case "MmAlbum":
                return null;
            case "MmArtist":
                return null;
            case "MmPlaylist":
                return null;
            case "MmQueue":
                return null;
            case "StSong":
                return this.data.t.thumbnails.at(0)?.url ?? null;
            case "StVideo":
                return this.data.t.thumbnails.at(0)?.url ?? null;
            case "StAlbum":
                return this.data.t.thumbnails.at(0)?.url ?? null;
            case "StPlaylist":
                return this.data.t.thumbnails.at(0)?.url ?? null;
            case "StArtist":
                return this.data.t.thumbnails.at(0)?.url ?? null;
            case "Song": {
                let song = this.data.t;
                for (let source of song.play_sources) {
                    switch (source.type) {
                        case "File":
                            break;
                        case "YtId": {
                            return `https://i.ytimg.com/vi/${source.content}/maxresdefault.jpg`;
                        } break;
                        default:
                            throw exhausted(source);
                    }
                }
                return null;
            } break;
            case "Playlist":
                return null;
            case "Queue":
                return null;
            case "Updater":
                return null;
            default:
                throw exhausted(this.data)
        }
    }

    default_thumbnail(): string {
        return "/static/default-music-icon.svg";
    }

    title_sub(): string | null {
        function authors(a: yt.Author[]) {
            if (a.length == 0) {
                return '';
            } else {
                return a
                    .map(a => a.name)
                    .reduce((p, c) => p + ", " + c);
            }
        }

        switch (this.data.typ) {
            case "MmSong":
                return this.data.t.artist_name;
            case "MmAlbum":
                return this.data.t.artist_name;
            case "MmArtist":
                return null;
            case "MmPlaylist":
                return this.data.t.data_list.length.toString() + " songs";
            case "MmQueue":
                return this.data.t.data_list.length.toString() + " songs";
            case "StSong":
                return authors(this.data.t.authors);
            case "StVideo":
                return authors(this.data.t.authors);
            case "StAlbum":
                return this.data.t.author?.name ?? null;
            case "StPlaylist":
                return this.data.t.author?.name ?? null;
            case "StArtist":
                return this.data.t.subscribers ?? null;
            case "Song":
                return this.data.t.haystacks.at(1) ?? null;
            case "Playlist":
            case "Queue":
            case "Updater":
                return null;
            default:
                throw exhausted(this.data)
        }
    }

    async audio_uri(): Promise<string | null> {
        switch (this.data.typ) {
            case "MmSong": {
                let song = this.data.t;
                if (song.last_known_path) {
                    return "file://" + song.last_known_path;
                } else {
                    let data = await get_uri(song.key);
                    if (!data) {
                        return null;
                    }
                    let thumbs = data.info.basic_info.thumbnail ?? [];
                    if (thumbs.length > 0 && !song.info?.thumbnail_url) {
                        if (song.info) {
                            song.info.thumbnail_url = thumbs[0].url;
                        } else {
                            song.info = {
                                duration: null,
                                tags: [],
                                album: null,
                                artist_names: [], // TODO: data.info.basic_info.author?
                                channel_id: data.info.basic_info.channel_id ?? '',
                                uploader_id: null,
                                video_id: song.key,
                                titles: [song.title],
                                thumbnail_url: thumbs[0].url,
                            };
                        }
                    }
                    return data.uri;
                }
            } break;
            case "StSong": {
                let song = this.data.t;
                let data = await get_uri(song.id);
                if (!data) {
                    return null;
                }
                return data.uri;
            } break;
            case "StVideo": {
                let song = this.data.t;
                let data = await get_uri(song.id);
                if (!data) {
                    return null;
                }
                return data.uri;
            } break;
            case "Song": {
                let song = this.data.t;
                for (let source of song.play_sources) {
                    switch (source.type) {
                        case "File":
                            return "file://" + source.content;
                        case "YtId": {
                            let data = await get_uri(source.content);
                            if (!data) {
                                continue;
                            }
                            return data.uri;
                        } break;
                        default:
                            throw exhausted(source);
                    }
                }
                return null;
            } break;
            case "MmAlbum":
            case "MmArtist":
            case "MmPlaylist":
            case "MmQueue":
            case "StAlbum":
            case "StPlaylist":
            case "StArtist":
            case "Playlist":
            case "Queue":
            case "Updater":
                return null;
            default:
                throw exhausted(this.data);
        }
    }

    options(ctx: RenderContext): Option[] {
        switch (ctx) {
            case "Queue":
                switch (this.data.typ) {
                    case "MmSong": {
                        let s = this.data.t;
                        return [
                            {
                                icon: "/static/play.svg",
                                location: "IconTop",
                                tooltip: "play",
                                onclick: async () => {
                                    stores.queue.update(q => {
                                        q.play_item(this);
                                        return q;
                                    });
                                    stores.playing_item.set(this);
                                },
                            },
                            {
                                icon: "/static/remove.svg",
                                location: "TopRight",
                                tooltip: "remove item",
                                onclick: () => {
                                    stores.queue.update(q => {
                                        q.remove_item(this);
                                        return q;
                                    });
                                },
                            },
                            {
                                icon: "/static/copy.svg",
                                location: "OnlyMenu",
                                tooltip: "copy url",
                                onclick: async () => {
                                    await navigator.clipboard.writeText("https://youtu.be/" + s.key);
                                    toast("url copied", "info");
                                },
                            },
                        ];
                    }
                    case "StSong":
                    case "StVideo":
                    case "Song":
                        return [];
                    case "StAlbum":
                    case "StPlaylist":
                    case "StArtist":
                    case "Playlist":
                    case "Queue":
                    case "Updater":
                    case "MmAlbum":
                    case "MmArtist":
                    case "MmPlaylist":
                    case "MmQueue":
                        throw new Error("cannot render " + this.data.typ + " in " + ctx + " context");
                    default:
                        throw exhausted(this.data)
                }
            case "Browser":
                switch (this.data.typ) {
                    case "MmSong": {
                        let s = this.data.t;
                        return [
                            {
                                icon: "/static/play.svg",
                                location: "IconTop",
                                tooltip: "play",
                                onclick: async () => {
                                    let uri = await this.audio_uri();
                                    if (uri) {
                                        get(stores.player).play(uri);
                                        stores.queue.update(q => {
                                            q.detour();
                                            return q;
                                        });
                                        stores.playing_item.set(this);
                                    } else {
                                        toast("could not play item", "error");
                                    }
                                },
                            },
                            {
                                icon: "/static/add.svg",
                                location: "TopRight",
                                tooltip: "add to queue",
                                onclick: () => {
                                    stores.queue.update(q => {
                                        q.add(this);
                                        return q;
                                    });
                                },
                            },
                            {
                                icon: "/static/add.svg",
                                location: "OnlyMenu",
                                tooltip: "remove from queue",
                                onclick: () => {
                                    stores.queue.update(q => {
                                        q.remove_item(this);
                                        return q;
                                    });
                                },
                            },
                            {
                                icon: "/static/copy.svg",
                                location: "OnlyMenu",
                                tooltip: "copy url",
                                onclick: async () => {
                                    await navigator.clipboard.writeText("https://youtu.be/" + s.key);
                                    toast("url copied", "info");
                                },
                            },
                        ];
                    }
                    case "MmAlbum": {
                        let list = this.data.t;
                        return [
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "TopRight",
                                tooltip: "open",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: list.songs,
                                    }, 30);
                                    stores.tabs.update(t => {
                                        t = [t[0]];
                                        t.push({
                                            name: list.name,
                                            searcher: writable(s),
                                            thumbnail: null,
                                        });
                                        return t;
                                    });
                                    stores.curr_tab_index.set(get(stores.tabs).length - 1);
                                },
                            },
                            {
                                icon: "/static/add.svg",
                                location: "OnlyMenu",
                                tooltip: "add all to queue",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: list.songs,
                                    }, list.songs.length);
                                    let items = await s.next_page();
                                    stores.queue.update(q => {
                                        q.add(...items);
                                        return q;
                                    });
                                },
                            },
                        ];
                    }
                    case "MmArtist": {
                        let a = this.data.t;
                        return [
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "TopRight",
                                tooltip: "open saved",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: a.songs,
                                    }, 30);
                                    stores.tabs.update(t => {
                                        t = [t[0]];
                                        t.push({
                                            name: a.name + " saved",
                                            searcher: writable(s),
                                            thumbnail: null,
                                        });
                                        return t;
                                    });
                                    stores.curr_tab_index.set(get(stores.tabs).length - 1);
                                },
                            },
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "OnlyMenu",
                                tooltip: "open unexplored",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: a.unexplored_songs ?? [],
                                    }, 30);
                                    stores.tabs.update(t => {
                                        t = [t[0]];
                                        t.push({
                                            name: a.name + " unexplored",
                                            searcher: writable(s),
                                            thumbnail: null,
                                        });
                                        return t;
                                    });
                                    stores.curr_tab_index.set(get(stores.tabs).length - 1);
                                },
                            },
                            {
                                icon: "/static/add.svg",
                                location: "OnlyMenu",
                                tooltip: "add all saved to queue",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: a.songs,
                                    }, a.songs.length);
                                    let items = await s.next_page();
                                    stores.queue.update(q => {
                                        q.add(...items);
                                        return q;
                                    });
                                },
                            },
                            {
                                icon: "/static/add.svg",
                                location: "OnlyMenu",
                                tooltip: "add all unexplored to queue",
                                onclick: async () => {
                                    let songs = a.unexplored_songs ?? [];
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: songs,
                                    }, songs.length);
                                    let items = await s.next_page();
                                    stores.queue.update(q => {
                                        q.add(...items);
                                        return q;
                                    });
                                },
                            },
                        ];
                    }
                    case "MmPlaylist":
                    case "MmQueue": {
                        let list = this.data.t;
                        return [
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "TopRight",
                                tooltip: "open",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: list.data_list,
                                    }, 30);
                                    stores.tabs.update(t => {
                                        t = [t[0]];
                                        t.push({
                                            name: list.name,
                                            searcher: writable(s),
                                            thumbnail: null,
                                        });
                                        return t;
                                    });
                                    stores.curr_tab_index.set(get(stores.tabs).length - 1);
                                },
                            },
                            {
                                icon: "/static/add.svg",
                                location: "OnlyMenu",
                                tooltip: "add all to queue",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: list.data_list,
                                    }, list.data_list.length);
                                    let items = await s.next_page();
                                    stores.queue.update(q => {
                                        q.add(...items);
                                        return q;
                                    });
                                },
                            },
                        ];
                    }
                    case "Song":
                    case "Playlist":
                    case "Queue":
                    case "Updater":
                    case "StSong":
                    case "StVideo":
                    case "StAlbum":
                    case "StPlaylist":
                    case "StArtist":
                        return [];
                    default:
                        throw exhausted(this.data)
                }
            case "Playbar":
                return [];
            default:
                throw exhausted(ctx);
        }
    }
}

interface IClassTypeWrapper<D> {
    next_page(): Promise<DbListItem[]>;
    inner: D;
    has_next_page: boolean;
    query: BrowseQuery;
};
function ClassTypeWrapper<D extends {
    query: BrowseQuery;
    next_page(): Promise<MusicListItem[]>;
    has_next_page: boolean;
}>(d: D) {
    return {
        inner: d,
        has_next_page: d.has_next_page,
        query: d.query,

        async next_page(): Promise<DbListItem[]> {
            let res = await d.next_page();

            let self = this as unknown as IClassTypeWrapper<D>;
            self.has_next_page = d.has_next_page;

            if (res.length === 0) {
                return [];
            }

            return res.map(m => new DbListItem(m));
        }
    } as unknown as IClassTypeWrapper<D>;
}

interface IAsyncProtWrapper<D> {
    next_page(): Promise<DbListItem[]>;
    inner: D;
    has_next_page: boolean;
    query: BrowseQuery;
    promise: Promise<DbListItem[]> | null,
};
function AsyncProtWrapper<D extends {
    query: BrowseQuery;
    next_page(): Promise<DbListItem[]>;
    has_next_page: boolean;
}>(d: D) {
    return {
        inner: d,
        has_next_page: d.has_next_page,
        query: d.query,
        promise: null,

        async next_page(): Promise<DbListItem[]> {
            let self = this as unknown as IAsyncProtWrapper<D>;

            if (!self.promise) {
                self.promise = d.next_page();
            }
            let res = await self.promise;
            self.promise = null;

            self.has_next_page = d.has_next_page;

            if (res.length === 0) {
                return [];
            }

            return res;
        }
    } as unknown as IAsyncProtWrapper<D>;
}

let server_base = `http://localhost:${import.meta.env.SERVER_PORT}/`;

export async function api_request<P, T>(url: string, json_payload: P) {
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
        let err: server.ErrorMessage = JSON.parse(body);
        console.error(err.stack_trace);
        throw new Error(err.message);
    }

    let resp: T = JSON.parse(body);
    // console.log(resp);
    return resp;
}

export async function api_request_no_resp<P, T>(url: string, json_payload: P) {
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
        let err: server.ErrorMessage = JSON.parse(body);
        console.error(err.stack_trace);
        throw new Error(err.message);
    }
}

export type AlmostDbItem<T> = Omit<DB.DbItem<T>, "id">;

export const db = {
    async insert<T>(t: AlmostDbItem<T>): Promise<DB.DbItem<T>> {
        let route = this.route(t.typ, "insert");

        let dbitem: DB.DbItem<T> = await api_request(server_base + route, t.t);
        return dbitem;
    },

    async update<T>(item: DB.DbItem<T>) {
        let route = this.route(item.typ, "update");

        await api_request_no_resp(server_base + route, item);
    },

    async delete<T>(item: DB.DbItem<T>) {
        let route = this.route(item.typ, "delete");

        await api_request_no_resp(server_base + route, item);
    },

    route(type: Typ, op: "search" | "insert" | "update" | "delete") {
        switch (type) {
            case "MmSong":
                return `musimanager/${op}/songs`;
            case "MmAlbum":
                return `musimanager/${op}/albums`;
            case "MmArtist":
                return `musimanager/${op}/artists`;
            case "MmPlaylist":
                return `musimanager/${op}/playlists`;
            case "MmQueue":
                return `musimanager/${op}/queues`;
            case "Song":
                return `covau/${op}/songs`;
            case "Playlist":
                return `covau/${op}/playlists`;
            case "Queue":
                return `covau/${op}/queues`;
            case "Updater":
                return `covau/${op}/updaters`;
            case "StSong":
                return `song_tube/${op}/songs`;
            case "StVideo":
                return `song_tube/${op}/videos`;
            case "StAlbum":
                return `song_tube/${op}/albums`;
            case "StPlaylist":
                return `song_tube/${op}/playlists`;
            case "StArtist":
                return `song_tube/${op}/artists`;
            default:
                throw exhausted(type);
        }
    },
};

export class Db extends Unpaged<MusicListItem> {
    query: BrowseQuery;
    page_size: number;

    constructor(query: BrowseQuery, page_size: number) {
        super();
        this.query = query;
        this.page_size = page_size;
    }

    static new(query: BrowseQuery, page_size: number) {
        let w2 = ClassTypeWrapper(Db.unwrapped(query, page_size));
        // let w3 = AsyncProtWrapper(w2);
        return w2;
    }

    static unwrapped(query: BrowseQuery, page_size: number) {
        const US = UniqueSearch<MusicListItem, typeof Db>(Db);
        const SS = SavedSearch<MusicListItem, typeof US>(US);
        return new SS(query, page_size);
    }

    static fused() {
        let s = Db.new({ type: '' } as unknown as BrowseQuery, 1);
        s.inner.has_next_page = false;
        return s;
    }

    static factory() {
        class Fac {
            page_size: number = 30;
            constructor() {
            }
            async search_query<T>(query: BrowseQuery) {
                type R = RSearcher<WrappedDb<T>>;
                let t = Db.new(query, this.page_size);
                return t as R | null;
            }
        }
        // const SS = SlowSearch<R, BrowseQuery, typeof Fac>(Fac);
        return new Fac();
    }

    async fetch(query: string): Promise<MusicListItem[]> {
        let q: DB.SearchQuery = {
            type: "Query",
            content: {
                query: query,
                page_size: this.page_size,
            },
        };
        let matches: DB.SearchMatches<unknown> = await api_request(
            server_base + db.route(this.query.type, "search"),
            q,
        );
        this.cont = matches.continuation;
        if (!this.cont) {
            this.has_next_page = false;
        }
        return matches.items as MusicListItem[];
    }

    cont: DB.SearchContinuation | null = null;
    page_end_index: number = 0;
    async next_page(): Promise<MusicListItem[]> {
        if (!this.has_next_page) {
            return [];
        }

        if (this.query.query_type === 'search') {
            let items;
            if (this.cont) {
                let q: DB.SearchQuery = {
                    type: "Continuation",
                    content: this.cont,
                };
                let matches: DB.SearchMatches<unknown> = await api_request(
                    server_base + db.route(this.query.type, "search"),
                    q,
                );
                this.cont = matches.continuation;
                if (!this.cont) {
                    this.has_next_page = false;
                }
                items = matches.items;
            } else {
                items = await this.fetch(this.query.query);
            }

            return keyed(items) as MusicListItem[];
        } else if (this.query.query_type === 'refids') {
            let ids = this.query.ids.slice(
                this.page_end_index,
                Math.min(
                    this.page_end_index + this.page_size,
                    this.query.ids.length,
                ),
            );
            this.page_end_index += ids.length;
            if (this.page_end_index >= this.query.ids.length) {
                this.has_next_page = false;
            }

            let matches: DB.DbItem<unknown>[] = await api_request(
                server_base + db.route(this.query.type, "search") + "/refid",
                ids,
            );
            return keyed(matches) as MusicListItem[];
        } else if (this.query.query_type === "ids") {
            let ids = this.query.ids.slice(
                this.page_end_index,
                Math.min(
                    this.page_end_index + this.page_size,
                    this.query.ids.length,
                ),
            );
            this.page_end_index += ids.length;
            if (this.page_end_index >= this.query.ids.length) {
                this.has_next_page = false;
            }

            let matches: DB.DbItem<unknown>[] = await api_request(
                server_base + db.route(this.query.type, "search") + "/dbid",
                ids,
            );
            return keyed(matches) as MusicListItem[];
        } else {
            throw exhausted(this.query);
        }
    }
}

const keyed = <T>(items: DB.DbItem<T>[]): (DB.DbItem<T> & Keyed)[] => {
    let res = items.map((e) => {
        let key = e.id;
        let p = e as DB.DbItem<T> & Keyed;
        p.get_key = function() {
            return key;
        };
        return p;
    });

    return res;
}
