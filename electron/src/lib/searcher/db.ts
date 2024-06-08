import { SavedSearch, UniqueSearch, Unpaged } from "./mixins.ts";
import { type WrappedDb, type Keyed, type RObject, type RSearcher } from "./searcher.ts";
import * as Musi from "$types/musimanager.ts";
import * as DB from "$types/db.ts";
import { exhausted } from "$lib/virtual.ts";
import { type Option, ListItem, type RenderContext } from "./item.ts";
import { toast } from "$lib/toast/toast.ts";
import * as stores from "$lib/stores.ts";
import { get, writable } from "svelte/store";
import { get_uri } from "./song_tube.ts";

export type Song = Musi.Song<Musi.SongInfo | null>;
export type Album = Musi.Album<Musi.SongId>;
export type Artist = Musi.Artist<Musi.SongId, Musi.AlbumId>;
export type Playlist = Musi.Playlist<Musi.SongId>;
export type Queue = Musi.Queue<Musi.SongId>;

// export type MusicListItem = Keyed & (
//     | (DB.DbItem<Song> & { typ: "MusimanagerSong"})
//     | DB.DbItem<Album>
//     | DB.DbItem<Artist>
//     | DB.DbItem<Playlist>
//     | DB.DbItem<Queue>
// );
export type MusicListItem = Keyed & (
    { id: number, typ: "MusimanagerSong", t: Song } |
    { id: number, typ: "MusimanagerAlbum", t: Album } |
    { id: number, typ: "MusimanagerArtist", t: Artist } |
    { id: number, typ: "MusimanagerPlaylist", t: Playlist } |
    { id: number, typ: "MusimanagerQueue", t: Queue }
);

export type Typ = DB.Typ;
export type BrowseQuery =
    { query_type: 'search', type: Typ, query: string } |
    { query_type: 'songs', ids: string[] };

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
            case "MusimanagerSong":
                return this.data.t.title;
            case "MusimanagerAlbum":
                return this.data.t.name;
            case "MusimanagerArtist":
                return this.data.t.name;
            case "MusimanagerPlaylist":
                return this.data.t.name;
            case "MusimanagerQueue":
                return this.data.t.name;
            default:
                throw exhausted(this.data)
        }
    }

    thumbnail(): string | null {
        switch (this.data.typ) {
            case "MusimanagerSong":
                return this.data.t.info?.thumbnail_url ?? null;
            case "MusimanagerAlbum":
                return null;
            case "MusimanagerArtist":
                return null;
            case "MusimanagerPlaylist":
                return null;
            case "MusimanagerQueue":
                return null;
            default:
                throw exhausted(this.data)
        }
    }

    default_thumbnail(): string {
        return "/static/default-music-icon.svg";
    }

    title_sub(): string | null {
        switch (this.data.typ) {
            case "MusimanagerSong":
                return this.data.t.artist_name;
            case "MusimanagerAlbum":
                return this.data.t.artist_name;
            case "MusimanagerArtist":
                return null;
            case "MusimanagerPlaylist":
                return this.data.t.data_list.length.toString() + " songs";
            case "MusimanagerQueue":
                return this.data.t.data_list.length.toString() + " songs";
            default:
                throw exhausted(this.data)
        }
    }

    options(ctx: RenderContext): Option[] {
        const song_play = (song: Song) => ({
            icon: "/static/play.svg",
            location: "IconTop",
            tooltip: "play",
            onclick: async () => {
                if (song.last_known_path) {
                    get(stores.player).play("file://" + song.last_known_path);
                } else {
                    let data = await get_uri(song.key);
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
                    get(stores.player).play(data.uri);
                }
                stores.playing_item.set(this);
            },
        } as Option);

        switch (ctx) {
            case "Queue":
                switch (this.data.typ) {
                    case "MusimanagerSong":
                        let song = this.data.t;
                        return [
                            song_play(song),
                            {
                                icon: "/static/remove.svg",
                                location: "TopRight",
                                tooltip: "add to queue",
                                onclick: () => {
                                },
                            },
                        ];
                    case "MusimanagerAlbum":
                    case "MusimanagerArtist":
                    case "MusimanagerPlaylist":
                    case "MusimanagerQueue":
                        throw new Error("cannot render " + this.data.typ + " in " + ctx + " context");
                    default:
                        throw exhausted(this.data)
                }
            case "Browser":
                switch (this.data.typ) {
                    case "MusimanagerSong":
                        let song = this.data.t;
                        return [
                            song_play(song),
                            {
                                icon: "/static/add.svg",
                                location: "TopRight",
                                tooltip: "add to queue",
                                onclick: () => { },
                            },
                        ];
                    case "MusimanagerAlbum": {
                        let list = this.data.t;
                        return [
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "TopRight",
                                tooltip: "open",
                                onclick: async () => {
                                    let s = Db.new({ query_type: "songs", ids: list.songs }, 30);
                                    stores.tabs.update(t => {
                                        t = [t[0]];
                                        t.push({ name: list.name, searcher: writable(s), thumbnail: null });
                                        return t;
                                    });
                                    stores.curr_tab_index.set(get(stores.tabs).length - 1);
                                },
                            },
                        ];
                    }
                    case "MusimanagerArtist": {
                        let a = this.data.t;
                        return [
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "TopRight",
                                tooltip: "open saved",
                                onclick: async () => {
                                    let s = Db.new({ query_type: "songs", ids: a.songs }, 30);
                                    stores.tabs.update(t => {
                                        t = [t[0]];
                                        t.push({ name: a.name + " saved", searcher: writable(s), thumbnail: null });
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
                                    let s = Db.new({ query_type: "songs", ids: a.unexplored_songs ?? [] }, 30);
                                    stores.tabs.update(t => {
                                        t = [t[0]];
                                        t.push({ name: a.name + " unexplored", searcher: writable(s), thumbnail: null });
                                        return t;
                                    });
                                    stores.curr_tab_index.set(get(stores.tabs).length - 1);
                                },
                            },
                        ];
                    }
                    case "MusimanagerPlaylist":
                    case "MusimanagerQueue": {
                        let list = this.data.t;
                        return [
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "TopRight",
                                tooltip: "open",
                                onclick: async () => {
                                    let s = Db.new({ query_type: "songs", ids: list.data_list }, 30);
                                    stores.tabs.update(t => {
                                        t = [t[0]];
                                        t.push({ name: list.name, searcher: writable(s), thumbnail: null });
                                        return t;
                                    });
                                    stores.curr_tab_index.set(get(stores.tabs).length - 1);
                                },
                            },
                        ];
                    }
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

    async fetch(type: Typ, query: string): Promise<MusicListItem[]> {
        if (type == 'MusimanagerSong') {
            this.route = "musimanager/search/songs";
        } else if (type == 'MusimanagerAlbum') {
            this.route = "musimanager/search/albums";
        } else if (type == 'MusimanagerArtist') {
            this.route = "musimanager/search/artists";
        } else if (type == 'MusimanagerPlaylist') {
            this.route = "musimanager/search/playlists";
        } else if (type == 'MusimanagerQueue') {
            this.route = "musimanager/search/queues";
        } else {
            throw exhausted(type)
        }

        let q: DB.SearchQuery = {
            type: "Query",
            content: {
                query: query,
                page_size: this.page_size,
            },
        };
        let res = await fetch(
            "http://localhost:6173/" + this.route,
            {
                method: "POST",
                body: JSON.stringify(q),
                headers: { "Content-Type": "application/json" },
            }
        );
        let body = await res.text();
        let matches: DB.SearchMatches<unknown> = JSON.parse(body);
        this.cont = matches.continuation;
        if (!this.cont) {
            this.has_next_page = false;
        }
        return matches.items as MusicListItem[];
    }

    cont: DB.SearchContinuation | null = null;
    route: string = '';
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
                let res = await fetch(
                    `http://localhost:${import.meta.env.SERVER_PORT}/` + this.route,
                    {
                        method: "POST",
                        body: JSON.stringify(q),
                        headers: { "Content-Type": "application/json" },
                    }
                );
                let body = await res.text();
                let matches: DB.SearchMatches<unknown> = JSON.parse(body);
                this.cont = matches.continuation;
                if (!this.cont) {
                    this.has_next_page = false;
                }
                items = matches.items;
            } else {
                items = await this.fetch(this.query.type, this.query.query);
            }

            return keyed(items) as MusicListItem[];
        } else if (this.query.query_type === 'songs') {
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

            let res = await fetch(
                `http://localhost:${import.meta.env.SERVER_PORT}/musimanager/search/songs/refid`,
                {
                    method: "POST",
                    body: JSON.stringify(ids),
                    headers: { "Content-Type": "application/json" },
                }
            );
            let body = await res.text();
            let matches: DB.DbItem<unknown>[] = JSON.parse(body);
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
