import { SavedSearch, UniqueSearch, Unpaged } from "./mixins.ts";
import { type WrappedDb, type Keyed, type RObject, type RSearcher } from "./searcher.ts";
import * as Musi from "$types/musimanager.ts";
import * as DB from "$types/db.ts";
import { exhausted } from "$lib/virtual.ts";
import { type Option, ListItem, type RenderContext } from "./item.ts";
import { toast } from "$lib/toast/toast.ts"; 
// import * as stores from "$lib/local/stores.ts";

export type Song = Musi.Song<Musi.SongInfo | null>;
export type Album = Musi.Album<Musi.SongId>;
export type Artist = Musi.Artist<Musi.SongId, Musi.AlbumId>;
export type Playlist = Musi.Playlist<Musi.SongId>;
export type Queue = Musi.Queue<Musi.SongId>;

export type MusicListItem = Keyed & { data: Keyed } & (
    { typ: "MusimanagerSong", data: Song } |
    { typ: "MusimanagerAlbum", data: Album } |
    { typ: "MusimanagerArtist", data: Artist } |
    { typ: "MusimanagerPlaylist", data: Playlist } |
    { typ: "MusimanagerQueue", data: Queue }
);

export type Typ = DB.Typ;
export type BrowseQuery =
    { query_type: 'search', type: Typ, query: string } |
    { query_type: 'songs', ids: string[] };

interface IUnionTypeWrapper<D> {
    next_page(): Promise<MusicListItem[]>;
    inner: D;
    has_next_page: boolean;
};
function UnionTypeWrapper<D extends {
    query: BrowseQuery;
    next_page(): Promise<RObject<unknown>[]>;
    has_next_page: boolean;
}>(d: D) {
    return {
        inner: d,
        has_next_page: d.has_next_page,

        async next_page(): Promise<MusicListItem[]> {
            let res = await d.next_page();

            let self = this as unknown as IUnionTypeWrapper<D>;
            self.has_next_page = d.has_next_page;

            switch (d.query.query_type) {
                case "search":
                    let typ = d.query.type;
                    return res.map(data => ({
                        typ: typ,
                        data: data,
                        get_key: data.get_key,
                    })) as unknown as MusicListItem[];
                case "songs":
                    return res.map(data => ({
                        typ: "MusimanagerSong",
                        data: data,
                        get_key: data.get_key,
                    })) as unknown as MusicListItem[];
                default:
                    throw exhausted(d.query);
            }
        }
    } as unknown as IUnionTypeWrapper<D>;
}

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
                return this.data.data.title;
            case "MusimanagerAlbum":
                return this.data.data.name;
            case "MusimanagerArtist":
                return this.data.data.name;
            case "MusimanagerPlaylist":
                return this.data.data.name;
            case "MusimanagerQueue":
                return this.data.data.name;
            default:
                throw exhausted(this.data)
        }
    }

    thumbnail(): string | null {
        switch (this.data.typ) {
            case "MusimanagerSong":
                return this.data.data.info?.thumbnail_url ?? null;
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
                return this.data.data.artist_name;
            case "MusimanagerAlbum":
                return this.data.data.artist_name;
            case "MusimanagerArtist":
                return null;
            case "MusimanagerPlaylist":
                return this.data.data.data_list.length.toString() + " songs";
            case "MusimanagerQueue":
                return this.data.data.data_list.length.toString() + " songs";
            default:
                throw exhausted(this.data)
        }
    }

    options(ctx: RenderContext): Option[] {
        switch (ctx) {
            case "Queue":
                switch (this.data.typ) {
                    case "MusimanagerSong":
                        return [
                            {
                                icon: "/static/add.svg",
                                location: "Pos1",
                                tooltip: "add to queue",
                                onclick: () => {
                                    toast("add onclick");
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
                        return [
                            {
                                icon: "/static/add.svg",
                                location: "Pos1",
                                tooltip: "add to queue",
                                onclick: () => { },
                            },
                        ];
                    case "MusimanagerAlbum":
                        return [];
                    case "MusimanagerArtist":
                        return [];
                    case "MusimanagerPlaylist":
                        return [];
                    case "MusimanagerQueue":
                        return [];
                    default:
                        throw exhausted(this.data)
                }
            default:
                throw exhausted(ctx);
        }
    }
}

interface IClassTypeWrapper<D> {
    next_page(): Promise<DbListItem[]>;
    inner: D;
    has_next_page: boolean;
};
function ClassTypeWrapper<D extends {
    query: BrowseQuery;
    next_page(): Promise<RObject<unknown>[]>;
    has_next_page: boolean;
}>(d: D) {
    return {
        inner: d,
        has_next_page: d.has_next_page,

        async next_page(): Promise<DbListItem[]> {
            let res = await d.next_page();

            let self = this as unknown as IUnionTypeWrapper<D>;
            self.has_next_page = d.has_next_page;

            if (res.length === 0) {
                return [];
            }

            let mli;
            switch (d.query.query_type) {
                case "search":
                    let typ = d.query.type;
                    mli = res.map(data => ({
                        typ: typ,
                        data: data,
                        get_key: data.get_key,
                    })) as unknown as MusicListItem[];
                    break;
                case "songs":
                    mli = res.map(data => ({
                        typ: "MusimanagerSong",
                        data: data,
                        get_key: data.get_key,
                    })) as unknown as MusicListItem[];
                    break;
                default:
                    throw exhausted(d.query);
            }

            return mli.map(m => new DbListItem(m));
        }
    } as unknown as IClassTypeWrapper<D>;
}

export class Db<T> extends Unpaged<T> {
    query: BrowseQuery;
    page_size: number;

    constructor(query: BrowseQuery, page_size: number) {
        super();
        this.query = query;
        this.page_size = page_size;
    }

    static new<T>(query: BrowseQuery, page_size: number) {
        return ClassTypeWrapper(Db.unwrapped<T>(query, page_size));
    }

    static unwrapped<T>(query: BrowseQuery, page_size: number) {
        const US = UniqueSearch<T, typeof Db<T>>(Db);
        const SS = SavedSearch<T, typeof US>(US);
        return new SS(query, page_size);
    }

    static fused<T>() {
        let s = Db.new<T>({ type: '' } as unknown as BrowseQuery, 1);
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
                let t = Db.new<WrappedDb<T>>(query, this.page_size);
                return t as R | null;
            }
        }
        // const SS = SlowSearch<R, BrowseQuery, typeof Fac>(Fac);
        return new Fac();
    }

    async fetch(type: Typ, query: string): Promise<T[]> {
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
            "http://localhost:10010/" + this.route,
            {
                method: "POST",
                body: JSON.stringify(q),
                headers: { "Content-Type": "application/json" },
            }
        );
        let body = await res.text();
        let matches: DB.SearchMatches<T> = JSON.parse(body);
        this.cont = matches.continuation;
        if (!this.cont) {
            this.has_next_page = false;
        }
        return matches.items;
    }

    cont: DB.SearchContinuation | null = null;
    route: string = '';
    page_end_index: number = 0;
    async next_page(): Promise<RObject<T>[]> {
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
                    "http://localhost:10010/" + this.route,
                    {
                        method: "POST",
                        body: JSON.stringify(q),
                        headers: { "Content-Type": "application/json" },
                    }
                );
                let body = await res.text();
                let matches: DB.SearchMatches<T> = JSON.parse(body);
                this.cont = matches.continuation;
                if (!this.cont) {
                    this.has_next_page = false;
                }
                items = matches.items;
            } else {
                items = await this.fetch(this.query.type, this.query.query);
            }

            let k;
            if (this.query.type == 'MusimanagerSong') {
                k = keyed(items, "key");
            } else if (this.query.type == 'MusimanagerAlbum') {
                k = keyed(items, "browse_id");
            } else if (this.query.type == 'MusimanagerArtist') {
                k = keyed(items, null);
            } else if (this.query.type == 'MusimanagerPlaylist') {
                k = keyed(items, null);
            } else if (this.query.type == 'MusimanagerQueue') {
                k = keyed(items, null);
            } else {
                throw exhausted(this.query.type);
            }

            return k as RObject<T>[];
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
                "http://localhost:10010/musimanager/search/songs/refid",
                {
                    method: "POST",
                    body: JSON.stringify(ids),
                    headers: { "Content-Type": "application/json" },
                }
            );
            let body = await res.text();
            let matches: T[] = JSON.parse(body);
            return keyed(matches, "key") as RObject<T>[];
        } else {
            throw exhausted(this.query);
        }
    }
}

let globally_unique_key: number = 0;
const keyed = <T>(items: T[], field: string | null): (T & Keyed)[] => {
    let res = items.map((e: any) => {
        let key = field ? e[field] : globally_unique_key++;
        let p = e as T & Keyed;
        p.get_key = function() {
            return key;
        };
        return p;
    });

    return res;
}
