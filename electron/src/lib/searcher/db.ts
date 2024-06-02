import { SavedSearch, UniqueSearch, Unpaged } from "./mixins";
import { type ForceDb, type Keyed, type RObject, type RSearcher } from "./searcher";
import * as Musi from "$types/musimanager";
import * as DB from "$types/db";

export type Song = Musi.Song<Musi.SongInfo | null>;
export type Album = Musi.Album<Musi.SongId>;
export type Artist = Musi.Artist<Musi.SongId, Musi.AlbumId>;
export type Playlist = Musi.Playlist<Musi.SongId>;
export type Queue = Musi.Queue<Musi.SongId>;

export type Typ = DB.Typ;
export type BrowseQuery =
    { query_type: 'search', type: Typ, query: string } |
    { query_type: 'songs', ids: string[] };

export class Db<T> extends Unpaged<T> {
    query: BrowseQuery;
    page_size: number;

    constructor(query: BrowseQuery, page_size: number) {
        super();
        this.query = query;
        this.page_size = page_size;
    }

    static new<T>(query: BrowseQuery, page_size: number) {
        const US = UniqueSearch<T, typeof Db<T>>(Db);
        const SS = SavedSearch<T, typeof US>(US);
        return new SS(query, page_size);
    }

    static fused<T>() {
        let s = Db.new<T>({ type: '' } as unknown as BrowseQuery, 1);
        s.has_next_page = false;
        return s;
    }

    static factory() {
        class Fac {
            page_size: number = 30;
            constructor() {
            }
            async search_query<T>(query: BrowseQuery) {
                type R = RSearcher<ForceDb<T>>;
                let t = Db.new<ForceDb<T>>(query, this.page_size);
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
            throw 'unreachable';
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
                throw 'unreachable';
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
            throw "unreachable";
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
