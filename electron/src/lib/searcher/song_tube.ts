import Innertube, { MusicShelfContinuation, YTMusic, YT, YTNodes, Misc } from "youtubei.js/web";
import { SavedSearch, SlowSearch, UniqueSearch, Unpaged } from "./mixins";
import type { Keyed, RObject, RSearcher } from "./searcher";
import { exhausted } from "$lib/virtual";
import { ListItem, type Option, type RenderContext } from "./item.ts";
import * as stores from "$lib/stores.ts";
import { get } from "svelte/store";

export { YT, YTNodes, YTMusic };
export type Search = YTMusic.Search;
export type SearchContinuation = Awaited<ReturnType<typeof YTMusic.Search.prototype.getContinuation>>;
export type MusicResponsiveListItem = YTNodes.MusicResponsiveListItem;
export type VideoInfo = YT.VideoInfo;

// https://github.com/LuanRT/YouTube.js/issues/321
export type Typ = 'song' | 'video' | 'album' | 'playlist' | 'artist';
export type BrowseQuery =
    { query_type: 'search', search: Typ, query: string } |
    { query_type: 'artist', id: string } |
    { query_type: 'album', id: string } |
    { query_type: 'playlist', id: string } |
    { query_type: 'up-next', id: string } |
    { query_type: 'home-feed' };

export type Author = {
    name: string,
    channel_id: string | null,
};
export type Song = {
    id: string,
    title: string | null,
    thumbnail: string | null,
    authors: Author[],
};
export type Video = Song;
export type Album = {
    id: string,
    title: string | null,
    thumbnail: string | null,
    author: Author | null,
};
export type Playlist = Album;
export type Artist = {
    id: string,
    name: string | null,
    subscribers: string | null,
    thumbnail: string | null,
};
export type MusicListItem =
    { typ: 'song', data: Song } |
    { typ: 'video', data: Video } |
    { typ: 'album', data: Album } |
    { typ: 'playlist', data: Playlist } |
    { typ: 'artist', data: Artist };

export class StListItem extends ListItem {
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
            case "song":
            case "video":
            case "album":
            case "playlist":
                return this.data.data.title ?? this.data.data.id;
            case "artist":
                return this.data.data.name ?? this.data.data.id;
            default:
                throw exhausted(this.data)
        }
    }

    thumbnail(): string | null {
        switch (this.data.typ) {
            case "song":
            case "video":
            case "album":
            case "playlist":
            case "artist":
                return this.data.data.thumbnail;
            default:
                throw exhausted(this.data)
        }
    }

    default_thumbnail(): string {
        return "/static/default-music-icon.svg";
    }

    title_sub(): string | null {
        function authors(a: Author[]) {
            if (a.length == 0) {
                return '';
            } else {
                return a
                    .map(a => a.name)
                    .reduce((p, c) => p + ", " + c);
            }
        }

        switch (this.data.typ) {
            case "song":
            case "video":
                return authors(this.data.data.authors);
            case "album":
            case "playlist":
                return this.data.data.author.name;
            case "artist":
                return this.data.data.subscribers;
            default:
                throw exhausted(this.data)
        }
    }

    options(ctx: RenderContext): Option[] {
        switch (ctx) {
            case "Queue":
                switch (this.data.typ) {
                    case "song":
                    case "video":
                        return [
                            {
                                icon: "/static/remove.svg",
                                location: "TopRight",
                                tooltip: "add to queue",
                                onclick: () => { },
                            },
                        ];
                    case "album":
                    case "playlist":
                    case "artist":
                        throw new Error("cannot render " + this.data.typ + " in " + ctx + " context");
                    default:
                        throw exhausted(this.data)
                }
            case "Browser":
                switch (this.data.typ) {
                    case "song":
                    case "video":
                        let song = this.data.data;
                        return [
                            {
                                icon: "/static/add.svg",
                                location: "TopRight",
                                tooltip: "add to queue",
                                onclick: () => { },
                            },
                            {
                                icon: "/static/play.svg",
                                location: "IconTop",
                                tooltip: "play",
                                onclick: async () => {
                                    get(stores.player).play(await get_uri(song.id));
                                    stores.playing_item.set(this);
                                },
                            },
                        ];
                    case "album":
                        return [];
                    case "playlist":
                        return [];
                    case "artist":
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
    next_page(): Promise<MusicListItem[]>;
    has_next_page: boolean;
}>(d: D) {
    return {
        inner: d,
        has_next_page: d.has_next_page,

        async next_page(): Promise<DbListItem[]> {
            let res = await d.next_page();

            let self = this as unknown as IUnionTypeWrapper<D>;
            self.has_next_page = d.has_next_page;

            return res.map(m => new StListItem(m));
        }
    } as unknown as IClassTypeWrapper<D>;
}

export class SongTube extends Unpaged<MusicListItem> {
    tube: Innertube;
    query: BrowseQuery;

    constructor(query: BrowseQuery, tube: Innertube) {
        super();
        this.tube = tube;
        this.query = query;
    }

    static new(query: BrowseQuery, tube: Innertube) {
        return ClassTypeWrapper(SongTube.unwrapped(query, tube));
    }

    static unwrapped(query: BrowseQuery, tube: Innertube) {
        const US = UniqueSearch<MusicListItem, typeof SongTube>(SongTube);
        const SS = SavedSearch<MusicListItem, typeof US>(US);
        return new SS(query, tube);
    }

    static fused() {
        let s = SongTube.new({ type: '' } as unknown as BrowseQuery, null as unknown as Innertube);
        s.has_next_page = false;
        return s;
    }

    static factory(tube: Innertube) {
        type R = RSearcher<MusicListItem>;
        class Fac {
            tube: Innertube;
            constructor(tube: Innertube) {
                this.tube = tube;
            }
            async search_query(query: BrowseQuery) {
                let t = SongTube.new(query, this.tube);
                return t as R | null;
            }
        }
        const SS = SlowSearch<R, BrowseQuery, typeof Fac>(Fac);
        return new SS(tube);
    }

    results: Search | null = null;
    cont: SearchContinuation | null = null;
    pages: Array<MusicShelfContinuation> = new Array();
    async next_page() {
        if (!this.has_next_page) {
            return [];
        }
        if (this.query.query_type == 'search') {
            return await this.next_page_search(this.query.query, this.query.search);
        } else if (this.query.query_type == 'artist') {
            let r = await this.next_page_artist_songs(this.query.id);
            console.log(r);
            return r;
        } else if (this.query.query_type == 'album') {
            let r = await this.next_page_album(this.query.id);
            return r;
        } else if (this.query.query_type == 'playlist') {
            let r = await this.next_page_playlist(this.query.id);
            return r;
        } else if (this.query.query_type == 'up-next') {
            let r = await this.next_page_up_next(this.query.id);
            return r;
        } else if (this.query.query_type == 'home-feed') {
            let r = await this.next_page_home_feed();
            return r;
        } else {
            throw exhausted(this.query);
        }
    }
    protected async next_page_up_next(video_id: string) {
        this.has_next_page = false;
        let r = await this.tube.music.getUpNext(video_id);
        let k = r.contents.filterType(YTNodes.PlaylistPanelVideo);

        let mli: MusicListItem[] = k.map(s => ({
            typ: 'song',
            data: {
                id: s.video_id,
                title: s.title.text ?? '',
                thumbnail: this.get_thumbnail(s.thumbnail),
                authors: s.artists?.map(a => ({ name: a.name, channel_id: a.channel_id ?? null })) ?? [],
            }
        }));
        return keyed(mli) as RObject<MusicListItem>[];
    }
    protected async next_page_home_feed() {
        this.has_next_page = false;
        let r = await this.tube.music.getHomeFeed();
        let k = r.sections?.filterType(YTNodes.MusicCarouselShelf).flatMap(e => e.contents.filterType(YTNodes.MusicResponsiveListItem)) ?? [];

        let mli: MusicListItem[] = k.map(s => ({
            typ: 'song',
            data: {
                id: s.id!,
                title: s.title ?? null,
                thumbnail: this.get_thumbnail(s.thumbnail),
                authors: s.artists?.map(a => ({ name: a.name, channel_id: a.channel_id ?? null })) ?? [],
            }
        }));
        return keyed(mli) as RObject<MusicListItem>[];
    }
    playlist: YTMusic.Playlist | null = null;
    protected async next_page_playlist(playlist_id: string) {
        if (!this.playlist) {
            this.playlist = await this.tube.music.getPlaylist(playlist_id);
        } else {
            this.playlist = await this.playlist.getContinuation();
        }
        this.has_next_page = this.playlist.has_continuation;

        let a = this.playlist.items;
        if (!a || a.length == 0) {
            this.has_next_page = false;
            return [];
        }

        let arr = a.filterType(YTNodes.MusicResponsiveListItem);

        let mli: MusicListItem[] = arr.map(p => ({
            typ: 'song',
            data: {
                id: p.id!,
                title: p.title ?? null,
                thumbnail: this.get_thumbnail(p.thumbnail),
                authors: p.artists?.map(a => ({ name: a.name, channel_id: a.channel_id ?? null })) ?? [],
            }
        }));
        return keyed(mli) as RObject<MusicListItem>[];
    }
    protected async next_page_album(album_id: string) {
        this.has_next_page = false;
        let a = await this.tube.music.getAlbum(album_id);
        let mli: MusicListItem[] = a.contents.map(a => ({
            typ: 'song',
            data: {
                id: a.id!,
                title: a.title ?? null,
                thumbnail: this.get_thumbnail(a.thumbnail),
                authors: a.artists?.map(a => ({ name: a.name, channel_id: a.channel_id ?? null })) ?? [],
            }
        }));
        return keyed(mli) as RObject<MusicListItem>[];
    }
    protected async next_page_artist_songs(artist_id: string) {
        this.has_next_page = false;
        let a = await this.tube.music.getArtist(artist_id);
        let r = await a.getAllSongs();
        let arr: MusicResponsiveListItem[];
        if (!r) {
            arr = [];
        } else {
            arr = r.contents;
        }

        let mli: MusicListItem[] = arr.map(e => ({
            typ: 'song',
            data: {
                id: e.id!,
                title: e.title ?? null,
                thumbnail: this.get_thumbnail(e.thumbnail),
                authors: e.artists?.map(a => ({ name: a.name, channel_id: a.channel_id ?? null })) ?? [],
            }
        }));
        return keyed(mli) as RObject<MusicListItem>[];
    }
    protected async next_page_search(query: string, type: Typ) {
        if (query.length == 0) {
            this.has_next_page = false;
            return [];
        }

        let songs: Array<MusicResponsiveListItem>;
        if (this.results === null) {
            this.results = await this.tube.music.search(query, { type: type });
            console.log(this.results);

            if (!this.results.contents) {
                this.has_next_page = false;
                return [];
            }

            let contents = this.results.contents
                .flatMap(e => e.contents?.filterType(YTNodes.MusicResponsiveListItem) ?? []);

            songs = contents;
        } else {
            if (this.cont === null) {
                this.cont = await this.results.getContinuation();
            } else {
                if (this.cont.has_continuation) {
                    this.cont = await this.cont.getContinuation();
                } else {
                    this.cont = null;
                }
            }
            console.log(this.cont)

            if (
                !this.cont
                || !this.cont.contents
                || !this.cont.contents.contents
                || !(this.cont.contents.contents.length > 0)
            ) {
                this.has_next_page = false;
                return [];
            }

            songs = [...this.cont.contents.contents.as(YTNodes.MusicResponsiveListItem)];
        }

        songs = songs.filter(e => !!e.id);


        let mli: MusicListItem[] = songs.map(e => {
            if (e.item_type === 'song' || e.item_type === 'video') {
                return {
                    typ: 'song',
                    data: {
                        id: e.id!,
                        title: e.title ?? null,
                        thumbnail: this.get_thumbnail(e.thumbnail),
                        authors: e.artists?.map(a => ({ name: a.name, channel_id: a.channel_id ?? null })) ?? [],
                    }
                }
            } else if (e.item_type === 'album' || e.item_type === 'playlist') {
                return {
                    typ: e.item_type,
                    data: {
                        id: e.id!,
                        title: e.title ?? null,
                        thumbnail: this.get_thumbnail(e.thumbnail),
                        author: e.author ? { name: e.author.name, channel_id: e.author?.channel_id ?? null } : null,
                    }
                }
            } else if (e.item_type === 'artist') {
                return {
                    typ: 'artist',
                    data: {
                        id: e.id!,
                        name: e.name ?? null,
                        thumbnail: this.get_thumbnail(e.thumbnail),
                        subscribers: e.subscribers ?? null,
                    }
                }
            } else {
                return {
                    typ: 'video',
                    data: {
                        id: e.id!,
                        title: e.title ?? null,
                        thumbnail: this.get_thumbnail(e.thumbnail),
                        authors: [],
                    }
                };
            }
        });
        let k = keyed(mli);

        this.has_next_page = this.results.has_continuation;
        return k as RObject<MusicListItem>[];
    }

    get_thumbnail(node: Misc.Thumbnail[] | YTNodes.MusicThumbnail | null | undefined): MusicListItem['data']['thumbnail'] | null {
        if (node === null || !node) {
            return null;
        }

        let t;
        if (node instanceof YTNodes.MusicThumbnail) {
            t = node.contents.map(t => t.url);
        } else {
            t = node.map(t => t.url);
        }

        return [...t, null][0];
    }
}

const keyed = <T extends { data: { id?: any } }>(items: T[]): (T & Keyed)[] => {
    let res = items.filter((e) => !!e.data.id).map((e) => {
        let p = e as T & Keyed;
        p.get_key = function() {
            if (!p.data.id) {
                console.warn("item does not have an id :/", p);
            }
            return p.data.id;
        };
        return p;
    });

    return res;
}

export async function get_uri(id: string) {
    let itube = get(stores.tube);
    let d = await itube.getInfo(id);
    console.log(d);
    let f = d.chooseFormat({ type: 'audio', quality: 'best', format: 'opus', client: 'YTMUSIC_ANDROID' });
    // let url = d.getStreamingInfo();
    let uri = f.decipher(itube.session.player);
    console.log(uri)
    return uri;
}
