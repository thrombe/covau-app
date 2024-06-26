import Innertube, { MusicShelfContinuation, YTMusic, YT, YTNodes, Misc } from "youtubei.js/web";
import { SavedSearch, UniqueSearch, Unpaged } from "./mixins.ts";
import { exhausted, type Keyed } from "$lib/virtual.ts";
import { ListItem, type Option, type RenderContext } from "./item.ts";
import * as stores from "$lib/stores.ts";
import { get, writable } from "svelte/store";
import { toast } from "$lib/toast/toast.ts";
import * as yt from "$types/yt.ts";
import * as covau from "$types/covau.ts";
import { type AlmostDbItem } from "$lib/local/db.ts";
import type { Searcher } from "./searcher.ts";
import type { AutoplayQueryInfo, AutoplayTyp } from "$lib/local/queue.ts";

export { YT, YTNodes, YTMusic };
export type Search = YTMusic.Search;
export type SearchContinuation = Awaited<ReturnType<typeof YTMusic.Search.prototype.getContinuation>>;
export type MusicResponsiveListItem = YTNodes.MusicResponsiveListItem;
export type VideoInfo = YT.VideoInfo;

// https://github.com/LuanRT/YouTube.js/issues/321
export type Typ = yt.Typ;
export type BrowseQuery = yt.BrowseQuery;

export type MusicListItem = yt.MusicListItem;
export type RObject = MusicListItem & Keyed;

export class StListItem extends ListItem {
    data: MusicListItem & Keyed;

    constructor(data: MusicListItem & Keyed) {
        super();
        this.data = data;
    }

    key(): unknown {
        return this.data.get_key();
    }

    song_ids(): string[] {
        switch (this.data.type) {
            case "Song":
            case "Video": {
                let song = this.data.content;
                return [song.id];
            } break;
            case "Album":
            case "Playlist":
            case "Artist":
                return [];
            default:
                throw exhausted(this.data)
        }
    }

    title(): string {
        switch (this.data.type) {
            case "Song":
            case "Video":
            case "Album":
            case "Playlist":
                return this.data.content.title ?? this.data.content.id;
            case "Artist":
                return this.data.content.name ?? this.data.content.id;
            default:
                throw exhausted(this.data)
        }
    }

    thumbnail(): string | null {
        switch (this.data.type) {
            case "Song":
            case "Video":
                return this.data.content.thumbnails.at(0)?.url ?? st.get_thumbnail(this.data.content.id);
            case "Album":
            case "Playlist":
            case "Artist":
                return this.data.content.thumbnails.at(0)?.url ?? null;
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

        switch (this.data.type) {
            case "Song":
            case "Video":
                return authors(this.data.content.authors);
            case "Album":
            case "Playlist":
                return this.data.content.author?.name ?? null;
            case "Artist":
                return this.data.content.subscribers;
            default:
                throw exhausted(this.data)
        }
    }

    async audio_uri() {
        switch (this.data.type) {
            case "Song":
            case "Video": {
                let s = this.data.content;
                let data = await st.get_uri(this.data.content.id);
                if (!data) {
                    return null;
                }
                let thumbs = SongTube.get_thumbnail(data.info.basic_info.thumbnail);
                this.data.content.thumbnails = thumbs;
                return data.uri;
            } break;
            case "Album":
            case "Playlist":
            case "Artist":
                return null;
            default:
                throw exhausted(this.data);
        }
    }

    async autoplay_query(typ: AutoplayTyp): Promise<AutoplayQueryInfo | null> {
        switch (this.data.type) {
            case "Song":
            case "Video": {
                let s = this.data.content;
                switch (typ) {
                    case "MbzRadio":
                    case "StSearchRelated":
                        return {
                            type: typ,
                            title: s.title ?? "",
                            artists: s.authors.map(a => a.name),
                        };
                    case "StRelated":
                        return { type: "StRelated", id: s.id };
                    default:
                        throw exhausted(typ);
                }
            } break;
            case "Album":
            case "Playlist":
            case "Artist":
                throw new Error("can't play this. so no autoplay.");
            default:
                throw exhausted(this.data);
        }
    }

    savable(): AlmostDbItem<unknown> | null {
        function not_null<T>(a: (T | null)[]): T[] {
            return a.filter(t => !!t) as T[];
        }
        switch (this.data.type) {
            case "Video":
            case "Song": {
                let song = this.data.content;
                let id: covau.PlaySource = { type: "YtId", content: song.id };
                let t: covau.Song = {
                    title: song.title ?? song.id,
                    artists: song.authors.map(a => a.name),
                    thumbnails: [st.get_thumbnail(song.id)],
                    play_sources: [id],
                    info_sources: [id],
                };
                return { typ: "Song", t };
            } break;
            case "Album": {
                return null;
            } break;
            case "Playlist": {
                return null;
            } break;
            case "Artist": {
                return null;
            } break;
            default:
                throw exhausted(this.data);
        }
    }

    options(ctx: RenderContext): Option[] {
        switch (ctx) {
            case "Queue":
                switch (this.data.type) {
                    case "Song":
                    case "Video": {
                        let s = this.data.content;
                        return [
                            {
                                icon: "/static/play.svg",
                                location: "IconTop",
                                tooltip: "play",
                                onclick: async () => {
                                    stores.queue.update(q => {
                                        q.play_queue_item(this);
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
                                        q.remove_queue_item(this);
                                        return q;
                                    });
                                },
                            },
                            {
                                icon: "/static/copy.svg",
                                location: "OnlyMenu",
                                tooltip: "copy url",
                                onclick: async () => {
                                    await navigator.clipboard.writeText("https://youtu.be/" + s.id);
                                    toast("url copied", "info");
                                },
                            },
                        ];
                    }
                    case "Album":
                    case "Playlist":
                    case "Artist":
                        throw new Error("cannot render " + this.data.type + " in " + ctx + " context");
                    default:
                        throw exhausted(this.data)
                }
            case "Browser":
                switch (this.data.type) {
                    case "Song":
                    case "Video": {
                        let s = this.data.content;
                        return [
                            {
                                icon: "/static/add.svg",
                                location: "TopRight",
                                tooltip: "add to queue",
                                onclick: async () => {
                                    stores.queue_ops.add_item(this);
                                },
                            },
                            {
                                icon: "/static/play.svg",
                                location: "IconTop",
                                tooltip: "play",
                                onclick: async () => {
                                    await stores.queue_ops.detour(this);
                                },
                            },
                            {
                                icon: "/static/copy.svg",
                                location: "OnlyMenu",
                                tooltip: "copy url",
                                onclick: async () => {
                                    await navigator.clipboard.writeText("https://youtu.be/" + s.id);
                                    toast("url copied", "info");
                                },
                            },
                        ];
                    }
                    case "Album": {
                        let a = this.data.content;
                        return [
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "TopRight",
                                tooltip: "open",
                                onclick: async () => {
                                    let s = SongTube.new({
                                        type: "Album",
                                        content: a.id,
                                    });
                                    stores.push_tab(s, "Album " + a.title, a.thumbnails.at(0)?.url ?? null);
                                },
                            },
                            {
                                icon: "/static/add.svg",
                                location: "OnlyMenu",
                                tooltip: "add all to queue",
                                onclick: async () => {
                                    let s = SongTube.new({
                                        type: "Album",
                                        content: a.id,
                                    });
                                    let items = await s.next_page();
                                    stores.queue.update(q => {
                                        q.add(...items);
                                        return q;
                                    });
                                },
                            },
                        ];
                    }
                    case "Playlist": {
                        let p = this.data.content;
                        return [
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "TopRight",
                                tooltip: "open",
                                onclick: async () => {
                                    let s = SongTube.new({
                                        type: "Playlist",
                                        content: p.id,
                                    });
                                    stores.push_tab(s, "Playlist " + p.title, p.thumbnails.at(0)?.url ?? null);
                                },
                            },
                        ];
                    }
                    case "Artist": {
                        let a = this.data.content;
                        return [
                            {
                                icon: "/static/open-new-tab.svg",
                                location: "TopRight",
                                tooltip: "explore songs",
                                onclick: async () => {
                                    let s = SongTube.new({
                                        type: "Artist",
                                        content: a.id,
                                    });
                                    stores.push_tab(s, "Artist " + a.name + " songs", a.thumbnails.at(0)?.url ?? null);
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
    next_page(): Promise<StListItem[]>;
    inner: D;
    has_next_page: boolean;
};
function ClassTypeWrapper<D extends {
    query: BrowseQuery;
    next_page(): Promise<(MusicListItem & Keyed)[]>;
    has_next_page: boolean;
}>(d: D) {
    return {
        inner: d,
        has_next_page: d.has_next_page,

        async next_page(): Promise<StListItem[]> {
            let res = await d.next_page();

            let self = this as unknown as IClassTypeWrapper<D>;
            self.has_next_page = d.has_next_page;

            return res.map(m => new StListItem(m));
        }
    } as unknown as IClassTypeWrapper<D>;
}

export const st = {
    async get_uri(id: string) {
        let itube = get(stores.tube);
        try {
            let d = await itube.getInfo(id);
            console.log(d);
            let f = d.chooseFormat({ type: 'audio', quality: 'best', format: 'opus', client: 'YTMUSIC_ANDROID' });
            // let url = d.getStreamingInfo();
            let uri = f.decipher(itube.session.player);
            console.log(uri)
            return { info: d, uri: uri };
        } catch {
            return null;
        }
    },

    // TODO: fetch info from cache first. sqlite db cache on app, browser storage on web
    async get_video(id: string) {
        let s = await get(stores.tube).getBasicInfo(id);
        return {
            id: id,
            title: s.basic_info.title ?? null,
            thumbnails: SongTube.get_thumbnail(s.basic_info.thumbnail),
            album: null,
            authors: s.basic_info.author ? [
                {
                    name: s.basic_info.author,
                    channel_id: s.basic_info.channel_id ?? null
                }
            ] : [],
        }
    },

    get_thumbnail(id: string) {
        return `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
    },

    get_st_song(s: YTNodes.PlaylistPanelVideo | YTNodes.MusicResponsiveListItem) {
        if (s.is(YTNodes.MusicResponsiveListItem)) {
            return {
                id: s.id!,
                title: s.title ?? null,
                thumbnails: SongTube.get_thumbnail(s.thumbnail),
                album: s.album?.id ? {
                    name: s.album.name,
                    id: s.album.id,
                } : null,
                authors: s.artists?.map(a => ({
                    name: a.name,
                    channel_id: a.channel_id ?? null,
                })) ?? [],
            } as yt.Song;
        } else if (s.is(YTNodes.PlaylistPanelVideo)) {
            return {
                id: s.video_id,
                title: s.title.text ?? null,
                thumbnails: SongTube.get_thumbnail(s.thumbnail),
                album: s.album?.id ? {
                    name: s.album.name,
                    id: s.album.id,
                } : null,
                authors: s.artists?.map(a => ({
                    name: a.name,
                    channel_id: a.channel_id ?? null,
                })) ?? [],
            } as yt.Song;
        } else {
            throw exhausted(s);
        }
    },
};

export class SongTube extends Unpaged<MusicListItem> {
    tube: Innertube;
    query: BrowseQuery;

    constructor(query: BrowseQuery) {
        super();
        this.tube = get(stores.tube);
        this.query = query;
    }

    static new(query: BrowseQuery) {
        return ClassTypeWrapper(SongTube.unwrapped(query));
    }

    static unwrapped(query: BrowseQuery) {
        const US = UniqueSearch<MusicListItem, typeof SongTube>(SongTube);
        const SS = SavedSearch<MusicListItem, typeof US>(US);
        return new SS(query);
    }

    results: Search | null = null;
    cont: SearchContinuation | null = null;
    pages: Array<MusicShelfContinuation> = new Array();
    async next_page() {
        if (!this.has_next_page) {
            return [];
        }
        if (this.query.type == 'Search') {
            return await this.next_page_search(this.query.content.query, this.query.content.search);
        } else if (this.query.type == 'Artist') {
            let r = await this.next_page_artist_songs(this.query.content);
            return r;
        } else if (this.query.type == 'Album') {
            let r = await this.next_page_album(this.query.content);
            return r;
        } else if (this.query.type == 'Playlist') {
            let r = await this.next_page_playlist(this.query.content);
            return r;
        } else if (this.query.type == 'UpNext') {
            let r = await this.next_page_up_next(this.query.content);
            return r;
        } else if (this.query.type == 'HomeFeed') {
            let r = await this.next_page_home_feed();
            return r;
        } else if (this.query.type == "SongIds") {
            let r = await this.next_page_song_ids(this.query.content.ids, this.query.content.batch_size);
            return r;
        } else {
            throw exhausted(this.query);
        }
    }
    page_end_index: number = 0;
    protected async next_page_song_ids(ids: string[], batch_size: number) {
        let batch = ids.slice(
            this.page_end_index,
            Math.min(
                this.page_end_index + batch_size,
                ids.length,
            ),
        );
        this.page_end_index += batch.length;
        if (this.page_end_index >= ids.length) {
            this.has_next_page = false;
        }

        let promises = batch.map(id => {
            return st.get_video(id).then(s => ({
                type: 'Song',
                content: s,
            } as MusicListItem)).catch(reason => ({
                type: 'Song',
                content: {
                    id: id,
                    title: id,
                    thumbnails: [],
                    album: null,
                    authors: [{
                        name: reason,
                        channel_id: null,
                    }],
                }
            } as MusicListItem));
        });

        let resolved_batch = await Promise.all(promises);

        return keyed(resolved_batch) as RObject[];
    }
    protected async next_page_up_next(video_id: string) {
        this.has_next_page = false;
        let r = await this.tube.music.getUpNext(video_id);
        // OOF: does not work. this playlist_id is not a normal playlist :/
        // return await this.next_page_playlist(r.playlist_id);
        let k = r.contents.filterType(YTNodes.PlaylistPanelVideo);

        let mli: MusicListItem[] = k.map(s => ({
            type: 'Song',
            content: st.get_st_song(s),
        }));
        return keyed(mli) as RObject[];
    }
    protected async next_page_home_feed() {
        this.has_next_page = false;
        let r = await this.tube.music.getHomeFeed();
        let k = r.sections
            ?.filterType(YTNodes.MusicCarouselShelf)
            .flatMap(e => e.contents.filterType(YTNodes.MusicResponsiveListItem)) ?? [];

        let mli: MusicListItem[] = k.map(s => ({
            type: 'Song',
            content: st.get_st_song(s),
        }));
        return keyed(mli) as RObject[];
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

        let mli: MusicListItem[] = arr.map(s => ({
            type: 'Song',
            content: st.get_st_song(s),
        }));
        return keyed(mli) as RObject[];
    }
    protected async next_page_album(album_id: string) {
        this.has_next_page = false;
        let a = await this.tube.music.getAlbum(album_id);
        let mli: MusicListItem[] = a.contents.map(a => ({
            type: 'Song',
            content: st.get_st_song(a),
        }));
        return keyed(mli) as RObject[];
    }
    artist_songs_playlist_id: string | null = null;
    protected async next_page_artist_songs(artist_id: string) {
        if (this.artist_songs_playlist_id) {
            return await this.next_page_playlist(this.artist_songs_playlist_id);
        } else {
            let a = await this.tube.music.getArtist(artist_id);
            let r = await a.getAllSongs();
            if (!r) {
                this.has_next_page = false;
                return [];
            } else {
                this.artist_songs_playlist_id = r.playlist_id;
                return await this.next_page_playlist(r.playlist_id);
            }
        }
    }
    protected async next_page_search(query: string, typ: Typ) {
        if (query.length == 0) {
            this.has_next_page = false;
            return [];
        }

        let type: 'song' | 'video' | 'album' | 'playlist' | 'artist';
        switch (typ) {
            case "YtSong":
                type = "song";
                break;
            case "YtVideo":
                type = "video";
                break;
            case "YtAlbum":
                type = "album";
                break;
            case "YtPlaylist":
                type = "playlist";
                break;
            case "YtArtist":
                type = "artist";
                break;
            default:
                throw exhausted(typ);
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
            if (e.item_type === 'song') {
                return {
                    type: 'Song',
                    content: st.get_st_song(e),
                }
            } else if (e.item_type === 'video') {
                return {
                    type: 'Video',
                    content: {
                        id: e.id!,
                        title: e.title ?? null,
                        thumbnails: SongTube.get_thumbnail(e.thumbnail),
                        authors: e.authors?.map(a => ({
                            name: a.name,
                            channel_id: a.channel_id ?? null,
                        })) ?? [],
                    }
                }
            } else if (e.item_type === 'album') {
                return {
                    type: 'Album',
                    content: {
                        id: e.id!,
                        title: e.title ?? null,
                        thumbnails: SongTube.get_thumbnail(e.thumbnail),
                        author: e.author ? {
                            name: e.author.name,
                            channel_id: e.author?.channel_id ?? null,
                        } : null,
                    }
                }
            } else if (e.item_type === 'playlist') {
                return {
                    type: 'Playlist',
                    content: {
                        id: e.id!,
                        title: e.title ?? null,
                        thumbnails: SongTube.get_thumbnail(e.thumbnail),
                        author: e.author ? {
                            name: e.author.name,
                            channel_id: e.author?.channel_id ?? null,
                        } : null,
                    }
                }
            } else if (e.item_type === 'artist') {
                return {
                    type: 'Artist',
                    content: {
                        id: e.id!,
                        name: e.name ?? null,
                        thumbnails: SongTube.get_thumbnail(e.thumbnail),
                        subscribers: e.subscribers ?? null,
                    }
                }
            } else {
                return {
                    type: 'Video',
                    content: {
                        id: e.id!,
                        title: e.title ?? null,
                        thumbnails: SongTube.get_thumbnail(e.thumbnail),
                        authors: [],
                    }
                };
            }
        });
        let k = keyed(mli);

        this.has_next_page = this.results.has_continuation;
        return k as RObject[];
    }

    static get_thumbnail(node: Misc.Thumbnail[] | YTNodes.MusicThumbnail | null | undefined): MusicListItem['content']['thumbnails'] {
        if (node === null || !node) {
            return [];
        }

        let t;
        if (node instanceof YTNodes.MusicThumbnail) {
            t = node.contents.map(t => ({ url: t.url, width: t.width, height: t.height }));
        } else {
            t = node.map(t => ({ url: t.url, width: t.width, height: t.height }));
        }

        return [...t];
    }
}

const keyed = <T extends { content: { id?: any } }>(items: T[]): (T & Keyed)[] => {
    let res = items
        .filter((e) => !!e.content.id)
        .map((e) => {
            let p = e as T & Keyed;
            p.get_key = function() {
                if (!p.content.id) {
                    console.warn("item does not have an id :/", p);
                }
                return p.content.id;
            };
            return p;
        });

    return res;
}
