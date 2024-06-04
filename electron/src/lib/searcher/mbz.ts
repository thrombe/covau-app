import { SavedSearch, UniqueSearch, Unpaged } from "./mixins";
import { type Keyed, type RObject } from "./searcher";
import * as MBZ from "$types/mbz";

export type Release = MBZ.ReleaseWithInfo;
export type ReleaseGroup = MBZ.ReleaseGroupWithInfo;
export type Artist = MBZ.Artist;
export type ArtistWithUrls = MBZ.WithUrlRels<MBZ.Artist>;
export type Recording = MBZ.Recording;

export type MusicListItem = Keyed & { data: Keyed } & (
    { typ: "MbzRelease", data: Release } |
    { typ: "MbzReleaseGroup", data: ReleaseGroup } |
    { typ: "MbzRecording", data: Recording } |
    { typ: "MbzArtist", data: Artist }
);

export type Typ = "MbzRelease" | "MbzReleaseGroup" | "MbzArtist" | "MbzRecording";
export type IdFetchTyp = Typ | "MbzArtistWithUrls"
export type BrowseQuery =
    { query_type: 'search', type: Typ, query: string } |
    { query_type: 'id', id: string, type: IdFetchTyp };

interface IUnionTypeWrapper<D> {
    next_page(): Promise<MusicListItem[]>;
    get(): Promise<MusicListItem>;
    inner: D;
    has_next_page: boolean;
};
function UnionTypeWrapper<D extends {
    query: BrowseQuery;
    next_page(): Promise<RObject<unknown>[]>;
    get(): Promise<RObject<unknown>>;
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
                case "id":
                    return res.map(data => ({
                        typ: d.query.type,
                        data: data,
                        get_key: data.get_key,
                    })) as unknown as MusicListItem[];
                default:
                    throw "unimplemented";
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

export class Mbz<T> extends Unpaged<T> {
    query: BrowseQuery;
    page_size: number;

    constructor(query: BrowseQuery, page_size: number) {
        super();
        this.query = query;
        this.page_size = page_size;
    }

    static new<T>(query: BrowseQuery, page_size: number) {
        return UnionTypeWrapper(Mbz.unwrapped<T>(query, page_size));
    }

    static unwrapped<T>(query: BrowseQuery, page_size: number) {
        const US = UniqueSearch<T, typeof Mbz<T>>(Mbz);
        const SS = SavedSearch<T, typeof US>(US);
        return new SS(query, page_size);
    }

    static fused<T>() {
        let s = Mbz.new<T>({ type: '' } as unknown as BrowseQuery, 1);
        s.inner.has_next_page = false;
        return s;
    }

    static factory() {
        class Fac {
            page_size: number = 30;
            constructor() {
            }
            async search_query<T>(query: BrowseQuery) {
                type R = ReturnType<typeof Mbz.new>;
                let t = Mbz.new<T>(query, this.page_size);
                return t as R | null;
            }
        }
        // const SS = SlowSearch<R, BrowseQuery, typeof Fac>(Fac);
        return new Fac();
    }

    async fetch(type: Typ, query: string): Promise<T[]> {
        if (type == 'MbzRelease') {
            this.route = "mbz/search/releases";
        } else if (type == 'MbzReleaseGroup') {
            this.route = "mbz/search/release_groups";
        } else if (type == 'MbzArtist') {
            this.route = "mbz/search/artists";
        } else if (type == 'MbzRecording') {
            this.route = "mbz/search/recordings";
        } else {
            throw 'unreachable';
        }

        let q: MBZ.SearchQuery = {
            type: "Search",
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
    async next_page(): Promise<RObject<T>[]> {
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
                    "http://localhost:10010/" + this.route,
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
                items = await this.fetch(this.query.type, this.query.query);
            }

            let k = keyed(items, "id");

            return k as RObject<T>[];
        } else if (this.query.query_type === 'id') {
            this.has_next_page = false;

            let match = await this.fetch_id(this.query.id, this.query.type);

            return [match] as RObject<T>[];
        } else {
            throw "unreachable";
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
        let route = '';
        if (type == 'MbzRelease') {
            route = "mbz/search/releases/id";
        } else if (type == 'MbzReleaseGroup') {
            route = "mbz/search/release_groups/id";
        } else if (type == 'MbzArtist') {
            route = "mbz/search/artists/id";
        } else if (type == 'MbzRecording') {
            route = "mbz/search/recordings/id";
        } else if (type == 'MbzArtistWithUrls') {
            route = "mbz/search/artist_with_urls/id";
        } else {
            throw 'unreachable';
        }

        let res = await fetch(
            "http://localhost:10010/" + route,
            {
                method: "POST",
                body: JSON.stringify(id),
                headers: { "Content-Type": "application/json" },
            }
        );
        let body = await res.text();
        let match: T = JSON.parse(body);
        let k = keyed([match], "id")[0];
        return k as RObject<T>;
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
