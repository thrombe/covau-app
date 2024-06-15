import { SavedSearch, UniqueSearch, Unpaged } from "./mixins.ts";
import * as MBZ from "$types/mbz.ts";
import { exhausted, type Keyed } from "$lib/virtual.ts";
import { ListItem, type Option, type RenderContext } from "./item.ts";
import type { AlmostDbItem } from "$lib/local/db.ts";
import * as st from "$lib/searcher/song_tube.ts";
import { get } from "svelte/store";
import * as stores from "$lib/stores.ts";
import { toast } from "$lib/toast/toast.ts";
import { utils as server } from "$lib/server.ts";
import { prompt } from "$lib/prompt/prompt.ts";
import { StaticSearcher } from "./searcher.ts";

export type ReleaseWithInfo = MBZ.ReleaseWithInfo;
export type ReleaseGroupWithInfo = MBZ.ReleaseGroupWithInfo;
export type Release = MBZ.Release;
export type ReleaseGroup = MBZ.ReleaseGroup;
export type Artist = MBZ.Artist;
export type ArtistWithUrls = MBZ.WithUrlRels<MBZ.Artist>;
export type Recording = MBZ.Recording;
export type RecordingWithInfo = MBZ.RecordingWithInfo;

export type MusicListItem = Keyed & { data: Keyed } & (
    | { typ: "MbzReleaseWithInfo", data: ReleaseWithInfo }
    | { typ: "MbzReleaseGroupWithInfo", data: ReleaseGroupWithInfo }
    | { typ: "MbzRelease", data: Release }
    | { typ: "MbzReleaseGroup", data: ReleaseGroup }
    | { typ: "MbzRecordingWithInfo", data: RecordingWithInfo }
    | { typ: "MbzRecording", data: Recording }
    | { typ: "MbzArtist", data: Artist }
);

export type SearchTyp = "MbzReleaseWithInfo" | "MbzReleaseGroupWithInfo" | "MbzArtist" | "MbzRecordingWithInfo";
export type IdFetchTyp = SearchTyp | "MbzArtistWithUrls";
export type LinkedTyp = (
    | "MbzReleaseGroup_MbzArtist"
    | "MbzRelease_MbzArtist"
    | "MbzRelease_MbzReleaseGroup"
    | "MbzRecording_MbzArtsit"
    | "MbzRecording_MbzRelease"
);
export type BrowseQuery =
    | { query_type: 'search', type: SearchTyp, query: string }
    | { query_type: 'linked', id: string, type: LinkedTyp };

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
            case "MbzRecordingWithInfo":
                return this.data.data.title;
            default:
                throw exhausted(this.data);
        }
    }
    thumbnail(): string | null {
        switch (this.data.typ) {
            case "MbzRecordingWithInfo":
            case "MbzReleaseWithInfo":
            case "MbzReleaseGroupWithInfo":
                return this.data.data.cover_art;
            case "MbzRelease":
            case "MbzReleaseGroup":
            case "MbzArtist":
            case "MbzRecording":
                return null;
            default:
                throw exhausted(this.data);
        }
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
                return null;
            case "MbzRecordingWithInfo":
                return authors(this.data.data.credit);
            default:
                throw exhausted(this.data);
        }
    }
    options(ctx: RenderContext): Option[] {
        switch (ctx) {
            case "Queue": {
                switch (this.data.typ) {
                    case "MbzRecording":
                    case "MbzRecordingWithInfo": {
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
                    case "MbzReleaseWithInfo":
                    case "MbzReleaseGroupWithInfo":
                    case "MbzReleaseGroup":
                    case "MbzRelease":
                    case "MbzArtist": {
                        throw new Error("Can't display this item in queue");
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
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "TopRight",
                                tooltip: "explore recordings",
                                onclick: async () => {
                                    let s = Mbz.new({
                                        query_type: "linked",
                                        type: "MbzRecording_MbzRelease",
                                        id: a.title,
                                    }, 30);
                                    stores.push_tab(s, "Recordings for " + a.title);
                                },
                            },
                        ];
                    } break;
                    case "MbzReleaseGroupWithInfo": {
                        let a = this.data.data;
                        return [
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "TopRight",
                                tooltip: "explore releases",
                                onclick: async () => {
                                    let s = Mbz.new({
                                        query_type: "linked",
                                        type: "MbzRelease_MbzReleaseGroup",
                                        id: a.id,
                                    }, 30);
                                    stores.push_tab(s, "Releases for " + a.title);
                                },
                            },
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "OnlyMenu",
                                tooltip: "explore recordings",
                                onclick: async () => {
                                    let releases = await mbz.recordings_from_releases(a.releases);
                                    let s = StaticSearcher(releases);
                                    stores.push_tab(s, "Releases for " + a.title);
                                },
                            },
                            {
                                icon: "/static/add.svg",
                                location: "OnlyMenu",
                                tooltip: "add all to queue",
                                onclick: async () => {
                                    let releases = await mbz.recordings_from_releases(a.releases);
                                    stores.queue.update(q => {
                                        q.add(...releases);
                                        return q;
                                    });
                                },
                            },
                        ];
                    } break;
                    case "MbzReleaseGroup": {
                        let a = this.data.data;
                        return [
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "TopRight",
                                tooltip: "explore releases",
                                onclick: async () => {
                                    let s = Mbz.new({
                                        query_type: "linked",
                                        type: "MbzRelease_MbzReleaseGroup",
                                        id: a.id,
                                    }, 30);
                                    stores.push_tab(s, "Releases for " + a.title);
                                },
                            },
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "OnlyMenu",
                                tooltip: "explore recordings",
                                onclick: async () => {
                                    let rel: ReleaseGroupWithInfo & Keyed = await mbz.id_fetch(a.id, "MbzReleaseGroupWithInfo");
                                    this.data.data = rel;
                                    this.data.typ = "MbzReleaseGroupWithInfo";
                                    let releases = await mbz.recordings_from_releases(rel.releases);
                                    let s = StaticSearcher(releases);
                                    stores.push_tab(s, "Releases for " + a.title);
                                },
                            },
                            {
                                icon: "/static/add.svg",
                                location: "OnlyMenu",
                                tooltip: "add all to queue",
                                onclick: async () => {
                                    let rel: ReleaseGroupWithInfo & Keyed = await mbz.id_fetch(a.id, "MbzReleaseGroupWithInfo");
                                    this.data.data = rel;
                                    this.data.typ = "MbzReleaseGroupWithInfo";
                                    let releases = await mbz.recordings_from_releases(rel.releases);
                                    stores.queue.update(q => {
                                        q.add(...releases);
                                        return q;
                                    });
                                },
                            },
                        ];
                    } break;
                    case "MbzRelease": {
                        let a = this.data.data;
                        return [
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "TopRight",
                                tooltip: "explore recordings",
                                onclick: async () => {
                                    let s = Mbz.new({
                                        query_type: "linked",
                                        type: "MbzRecording_MbzRelease",
                                        id: a.id,
                                    }, 30);
                                    stores.push_tab(s, "Recordings for " + a.title);
                                },
                            },
                        ];
                    } break;
                    case "MbzRecordingWithInfo":
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
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "OnlyMenu",
                                tooltip: "explore release groups",
                                onclick: async () => {
                                    let s = Mbz.new({
                                        query_type: "linked",
                                        type: "MbzReleaseGroup_MbzArtist",
                                        id: a.id,
                                    }, 30);
                                    stores.push_tab(s, "Release groups for " + a.name);
                                },
                            },
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "OnlyMenu",
                                tooltip: "explore releases",
                                onclick: async () => {
                                    let s = Mbz.new({
                                        query_type: "linked",
                                        type: "MbzRelease_MbzArtist",
                                        id: a.id,
                                    }, 30);
                                    stores.push_tab(s, "Releases for " + a.name);
                                },
                            },
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "TopRight",
                                tooltip: "explore recordings",
                                onclick: async () => {
                                    let s = Mbz.new({
                                        query_type: "linked",
                                        type: "MbzRecording_MbzArtsit",
                                        id: a.id,
                                    }, 30);
                                    stores.push_tab(s, "Recordings for " + a.name);
                                },
                            },
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
        const play_recording = async (recording: RecordingWithInfo) => {
            let query: string | null = null;

            let artist = recording.credit.at(0)?.name ?? null;
            if (artist) {
                query = recording.title + " by " + artist;
            }

            let release_id = recording.releases.at(0)?.id ?? null;
            if (release_id) {
                let release: ReleaseWithInfo = await mbz.id_fetch(release_id, "MbzReleaseWithInfo");
                let release_group = release.release_group?.title;

                if (!query && release_group) {
                    query = recording.title + release_group;
                }
            }

            if (!query) {
                query = await prompt("Enter a search query");
            }
            if (!query) {
                return null;
            }

            let searcher = st.SongTube.new({
                type: "Search",
                content: {
                    search: "YtSong",
                    query: query,
                },
            });

            stores.push_tab(searcher, query);
            stores.query_input.set(query);
            stores.curr_tab_index.set(get(stores.tabs).length - 2);

            let songs = await searcher.next_page();
            let song = songs.at(0) ?? null;

            recording.cover_art = song?.thumbnail() ?? null;

            return song?.audio_uri() ?? null;
        };

        switch (this.data.typ) {
            case "MbzRecording": {
                let recording: RecordingWithInfo & Keyed = await mbz.id_fetch(this.data.data.id, "MbzRecordingWithInfo");
                this.data.data = recording;
                this.data.typ = "MbzRecordingWithInfo" as unknown as "MbzRecording"; // what a nice day it is :)
                return await play_recording(recording);
            } break;
            case "MbzRecordingWithInfo": {
                return await play_recording(this.data.data);
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
    inner: D;
    has_next_page: boolean;
};
function UnionTypeWrapper<D extends {
    query: BrowseQuery;
    next_page(): Promise<Keyed[]>;
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
                case "linked": {
                    let typ = d.query.type;
                    return res.map(data => ({
                        typ: typ.substring(0, typ.indexOf("_")),
                        data: data,
                        get_key: data.get_key,
                    })) as unknown as MusicListItem[]
                } break;
                default:
                    throw exhausted(type)
            }
        },
    } as unknown as IUnionTypeWrapper<D>;
}

let server_base = `http://localhost:${import.meta.env.SERVER_PORT}/`;
export const mbz = {
    async id_fetch<T>(id: string, type: IdFetchTyp) {
        let route = this.id_fetch_route(type);
        let res: T = await server.api_request(route, id);
        let k = keyed([res], "id")[0];
        return k;
    },

    async recordings_from_releases(releases: Release[]) {
        let recordings_es = await Promise.all(
            releases
                .map(r => Mbz.new({
                    query_type: "linked",
                    id: r.id,
                    type: "MbzRecording_MbzRelease",
                }, 200).next_page()));
        let recordings = recordings_es.flat();
        let set = new Set();
        let deduped: MbzListItem[] = [];
        for (let rec of recordings) {
            if (!set.has(rec.data.data.id)) {
                set.add(rec.data.data.id);
                deduped.push(rec);
            }
        }
        return deduped;
    },

    search_route(type: SearchTyp) {
        switch (type) {
            case "MbzReleaseWithInfo":
                return server_base + "mbz/search/releases_with_info";
            case "MbzReleaseGroupWithInfo":
                return server_base + "mbz/search/release_groups_with_info";
            case "MbzArtist":
                return server_base + "mbz/search/artists";
            case "MbzRecordingWithInfo":
                return server_base + "mbz/search/recordings_with_info";
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
            case "MbzRecordingWithInfo":
                return server_base + "mbz/search/recordings_with_info/id";
            case "MbzArtistWithUrls":
                return server_base + "mbz/search/artist_with_urls/id";
            default:
                throw exhausted(type);
        }
    },
    linked_route(type: LinkedTyp) {
        switch (type) {
            case "MbzReleaseGroup_MbzArtist":
                return server_base + "mbz/search/release_groups/linked/artist";
            case "MbzRelease_MbzArtist":
                return server_base + "mbz/search/releases/linked/artist";
            case "MbzRelease_MbzReleaseGroup":
                return server_base + "mbz/search/releases/linked/release_group";
            case "MbzRecording_MbzArtsit":
                return server_base + "mbz/search/recordings/linked/artist";
            case "MbzRecording_MbzRelease":
                return server_base + "mbz/search/recordings/linked/release";
            default:
                throw exhausted(type);
        }
    }
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
        let matches: MBZ.SearchResults<T> = await server.api_request(this.route, q);
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
                let matches: MBZ.SearchResults<T> = await server.api_request(this.route, q);
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
        } else if (this.query.query_type === "linked") {
            let items;
            if (this.cont) {
                let q: MBZ.SearchQuery = {
                    type: "Continuation",
                    content: this.cont,
                };
                let matches: MBZ.SearchResults<T> = await server.api_request(this.route, q);
                this.cont = matches.continuation;
                if (!this.cont) {
                    this.has_next_page = false;
                }
                items = matches.items;
            } else {
                this.route = mbz.linked_route(this.query.type);
                items = await this.fetch(this.query.id);
            }

            let k = keyed(items, "id");

            return k as (T & Keyed)[];
        } else {
            throw exhausted(this.query);
        }
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
