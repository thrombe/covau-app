import { SavedSearch, UniqueSearch, Unpaged } from "./mixins.ts";
import * as MBZ from "$types/mbz.ts";
import { exhausted, type Keyed } from "$lib/virtual.ts";
import { ListItem, type Option, type RenderContext } from "./item.ts";
import type { AlmostDbItem } from "$lib/local/db.ts";
import * as st from "$lib/searcher/song_tube.ts";
import { get, writable } from "svelte/store";
import * as stores from "$lib/stores.ts";
import { toast } from "$lib/toast/toast.ts";

export type ReleaseWithInfo = MBZ.ReleaseWithInfo;
export type ReleaseGroupWithInfo = MBZ.ReleaseGroupWithInfo;
export type Release = MBZ.Release;
export type ReleaseGroup = MBZ.ReleaseGroup;
export type Artist = MBZ.Artist;
export type ArtistWithUrls = MBZ.WithUrlRels<MBZ.Artist>;
export type Recording = MBZ.Recording;

export type MusicListItem = Keyed & { data: Keyed } & (
    | { typ: "MbzReleaseWithInfo", data: ReleaseWithInfo }
    | { typ: "MbzReleaseGroupWithInfo", data: ReleaseGroupWithInfo }
    | { typ: "MbzRelease", data: Release }
    | { typ: "MbzReleaseGroup", data: ReleaseGroup }
    | { typ: "MbzRecording", data: Recording }
    | { typ: "MbzArtist", data: Artist }
);

export type SearchTyp = "MbzReleaseWithInfo" | "MbzReleaseGroupWithInfo" | "MbzArtist" | "MbzRecording";
export type IdFetchTyp = SearchTyp | "MbzArtistWithUrls";
export type BrowseQuery =
    | { query_type: 'search', type: SearchTyp, query: string }
    | { query_type: 'id', id: string, type: IdFetchTyp }

export class MbzListItem extends ListItem {
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
            case "MbzReleaseWithInfo":
                return this.data.data.title;
            case "MbzReleaseGroupWithInfo":
                return this.data.data.title;
            case "MbzRelease":
                return this.data.data.title;
            case "MbzReleaseGroup":
                return this.data.data.title;
            case "MbzArtist":
                return this.data.data.name;
            case "MbzRecording":
                return this.data.data.title;
            default:
                throw exhausted(this.data);
        }
    }
    thumbnail(): string | null {
        return null;
    }
    default_thumbnail(): string {
        return "/static/default-music-icon.svg";
    }
    title_sub(): string | null {
        function authors(a: Artist[]) {
            if (a.length == 0) {
                return '';
            } else {
                return a
                    .map(a => a.name)
                    .reduce((p, c) => p + ", " + c);
            }
        }
        function releases(a: MBZ.Release[]) {
            if (a.length == 0) {
                return '';
            } else {
                return a
                    .map(a => a.title)
                    .reduce((p, c) => p + ", " + c);
            }
        }

        switch (this.data.typ) {
            case "MbzReleaseWithInfo":
                return authors(this.data.data.credit);
            case "MbzReleaseGroupWithInfo":
                return authors(this.data.data.credit);
            case "MbzRelease":
                return null;
            case "MbzReleaseGroup":
                return null;
            case "MbzArtist":
                return this.data.data.disambiguation;
            case "MbzRecording":
                return releases(this.data.data.releases);
            default:
                throw exhausted(this.data);
        }
    }
    options(ctx: RenderContext): Option[] {
        switch (ctx) {
            case "Queue": {
                switch (this.data.typ) {
                    case "MbzReleaseWithInfo": {
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
                                tooltip: "remove from queue",
                                onclick: () => {
                                    stores.queue.update(q => {
                                        q.remove_item(this);
                                        return q;
                                    });
                                },
                            },
                        ];
                    } break;
                    case "MbzReleaseGroupWithInfo": {
                        return [];
                    } break;
                    case "MbzReleaseGroup": {
                        return [];
                    } break;
                    case "MbzRelease": {
                        return [];
                    } break;
                    case "MbzRecording": {
                        return [];
                    } break;
                    case "MbzArtist": {
                        return [];
                    } break;
                    default:
                        throw exhausted(this.data);
                }
            } break;
            case "Browser": {
                switch (this.data.typ) {
                    case "MbzReleaseWithInfo": {
                        let a = this.data.data;
                        return [
                        ];
                    } break;
                    case "MbzReleaseGroupWithInfo": {
                        let a = this.data.data;
                        return [
                        ];
                    } break;
                    case "MbzReleaseGroup": {
                        let a = this.data.data;
                        return [
                        ];
                    } break;
                    case "MbzRelease": {
                        let a = this.data.data;
                        return [
                        ];
                    } break;
                    case "MbzRecording": {
                        return [
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
                                icon: "/static/play.svg",
                                location: "IconTop",
                                tooltip: "play",
                                onclick: async () => {
                                    let uri = await this.audio_uri();
                                    if (!uri) {
                                        toast("could not play item", "error");
                                        return;
                                    }
                                    get(stores.player).play(uri);
                                    stores.playing_item.set(this);
                                },
                            },
                        ];
                    } break;
                    case "MbzArtist": {
                        let a = this.data.data;
                        return [
                        ];
                    } break;
                    default:
                        throw exhausted(this.data);
                }
            } break;
            case "Playbar":
                return [];
            default:
                throw exhausted(ctx);
        }
    }
    async audio_uri(): Promise<string | null> {
        switch (this.data.typ) {
            case "MbzRecording": {
                // TODO: fetch more details for it? and then search "{song} by {artist}"
                let searcher = st.SongTube.new({
                    type: "Search",
                    content: {
                        search: "YtSong",
                        query: this.data.data.title,
                    },
                }, get(stores.tube));
                let songs = await searcher.next_page();
                return songs.at(0)?.audio_uri() ?? null;
            } break;
            case "MbzReleaseWithInfo":
            case "MbzRelease":
            case "MbzReleaseGroupWithInfo":
            case "MbzReleaseGroup":
            case "MbzArtist":
                return null;
            default:
                throw exhausted(this.data);
        }
    }
    savable(): AlmostDbItem<unknown> | null {
        return null;
    }
}

interface IClassTypeWrapper<D> {
    next_page(): Promise<MbzListItem[]>;
    inner: D;
    has_next_page: boolean;
};
function ClassTypeWrapper<D extends {
    query: BrowseQuery;
    next_page(): Promise<MusicListItem[]>;
    has_next_page: boolean;
}>(d: D) {
    return {
        inner: d,
        has_next_page: d.has_next_page,

        async next_page(): Promise<MbzListItem[]> {
            let res = await d.next_page();

            let self = this as unknown as IClassTypeWrapper<D>;
            self.has_next_page = d.has_next_page;

            return res.map(m => new MbzListItem(m));
        }
    } as unknown as IClassTypeWrapper<D>;
}

interface IUnionTypeWrapper<D> {
    query: BrowseQuery;
    next_page(): Promise<MusicListItem[]>;
    get(): Promise<MusicListItem>;
    inner: D;
    has_next_page: boolean;
};
function UnionTypeWrapper<D extends {
    query: BrowseQuery;
    next_page(): Promise<Keyed[]>;
    get(): Promise<Keyed>;
    has_next_page: boolean;
}>(d: D) {
    return {
        inner: d,
        has_next_page: d.has_next_page,

        async next_page(): Promise<MusicListItem[]> {
            let res = await d.next_page();

            let self = this as unknown as IUnionTypeWrapper<D>;
            self.has_next_page = d.has_next_page;

            let type = d.query.query_type;
            switch (type) {
                case "search": {
                    let typ = d.query.type;
                    return res.map(data => ({
                        typ: typ,
                        data: data,
                        get_key: data.get_key,
                    })) as unknown as MusicListItem[];
                } break;
                case "id": {
                    return res.map(data => ({
                        typ: d.query.type,
                        data: data,
                        get_key: data.get_key,
                    })) as unknown as MusicListItem[];
                default:
                    throw exhausted(type)
            }
        },

        async get(): Promise<MusicListItem> {
            let data = await d.get();
            return {
                typ: d.query.type,
                data,
                get_key: data.get_key,
            } as unknown as MusicListItem;
        },
    } as unknown as IUnionTypeWrapper<D>;
}

let server_base = `http://localhost:${import.meta.env.SERVER_PORT}/`;
export const mbz = {
    search_route(type: SearchTyp) {
        switch (type) {
            case "MbzReleaseWithInfo":
                return server_base + "mbz/search/releases_with_info";
            case "MbzReleaseGroupWithInfo":
                return server_base + "mbz/search/release_groups_with_info";
            case "MbzArtist":
                return server_base + "mbz/search/artists";
            case "MbzRecording":
                return server_base + "mbz/search/recordings";
            default:
                throw exhausted(type);
        }
    },
    id_fetch_route(type: IdFetchTyp) {
        switch (type) {
            case "MbzReleaseWithInfo":
                return server_base + "mbz/search/releases_with_info/id";
            case "MbzReleaseGroupWithInfo":
                return server_base + "mbz/search/release_groups_with_info/id";
            case "MbzArtist":
                return server_base + "mbz/search/artists/id";
            case "MbzRecording":
                return server_base + "mbz/search/recordings/id";
            case "MbzArtistWithUrls":
                return server_base + "mbz/search/artist_with_urls/id";
            default:
                throw exhausted(type);
        }
    },
};

export class Mbz<T> extends Unpaged<T> {
    query: BrowseQuery;
    page_size: number;

    constructor(query: BrowseQuery, page_size: number) {
        super();
        this.query = query;
        this.page_size = page_size;
    }

    static new<T>(query: BrowseQuery, page_size: number) {
        let w0 = Mbz.unwrapped<T>(query, page_size);
        let w1 = UnionTypeWrapper(w0);
        let w2 = ClassTypeWrapper(w1);
        return w2
    }

    static unwrapped<T>(query: BrowseQuery, page_size: number) {
        const US = UniqueSearch<T, typeof Mbz<T>>(Mbz);
        const SS = SavedSearch<T, typeof US>(US);
        return new SS(query, page_size);
    }

    async fetch(query: string): Promise<T[]> {
        if (query.length == 0) {
            this.has_next_page = false;
            return [];
        }

        let q: MBZ.SearchQuery = {
            type: "Search",
            content: {
                query: query,
                page_size: this.page_size,
            },
        };
        let res = await fetch(
            this.route,
            {
                method: "POST",
                body: JSON.stringify(q),
                headers: { "Content-Type": "application/json" },
            }
        );
        let body = await res.text();
        let matches: MBZ.SearchResults<T> = JSON.parse(body);
        this.cont = matches.continuation;
        if (!this.cont) {
            this.has_next_page = false;
        }
        return matches.items;
    }

    cont: MBZ.SearchContinuation | null = null;
    route: string = '';
    page_end_index: number = 0;
    async next_page(): Promise<(T & Keyed)[]> {
        if (!this.has_next_page) {
            return [];
        }

        if (this.query.query_type === 'search') {
            let items;
            if (this.cont) {
                let q: MBZ.SearchQuery = {
                    type: "Continuation",
                    content: this.cont,
                };
                let res = await fetch(
                    this.route,
                    {
                        method: "POST",
                        body: JSON.stringify(q),
                        headers: { "Content-Type": "application/json" },
                    }
                );
                let body = await res.text();
                let matches: MBZ.SearchResults<T> = JSON.parse(body);
                this.cont = matches.continuation;
                if (!this.cont) {
                    this.has_next_page = false;
                }
                items = matches.items;
            } else {
                this.route = mbz.search_route(this.query.type);
                items = await this.fetch(this.query.query);
            }

            let k = keyed(items, "id");

            return k as (T & Keyed)[];
        } else if (this.query.query_type === 'id') {
            this.has_next_page = false;

            let match = await this.fetch_id(this.query.id, this.query.type);

            return [match] as (T & Keyed)[];
        } else {
            throw exhausted(this.query);
        }
    }

    async get() {
        if (this.query.query_type === 'id') {
            this.has_next_page = false;

            let match = await this.fetch_id(this.query.id, this.query.type);

            return match;
        } else {
            throw "query type should be 'id' to call get()";
        }
    }

    private async fetch_id(id: string, type: IdFetchTyp) {
        let route = mbz.id_fetch_route(type);

        let res = await fetch(
            route,
            {
                method: "POST",
                body: JSON.stringify(id),
                headers: { "Content-Type": "application/json" },
            }
        );
        let body = await res.text();
        let match: T = JSON.parse(body);
        let k = keyed([match], "id")[0];
        return k as (T & Keyed);
    }
}

const keyed = <T>(items: T[], field: string): (T & Keyed)[] => {
    let res = items.map((e: any) => {
        let key = e[field];
        let p = e as T & Keyed;
        p.get_key = function() {
            return key;
        };
        return p;
    });

    return res;
}
