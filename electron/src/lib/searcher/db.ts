import { AsyncWrapper, SavedSearch, UniqueSearch, Unpaged, type Constructor } from "./mixins.ts";
import * as Musi from "$types/musimanager.ts";
import * as yt from "$types/yt.ts";
import * as covau from "$types/covau.ts";
import * as DB from "$types/db.ts";
import { exhausted, type Keyed } from "$lib/virtual.ts";
import { type Option, ListItem, type RenderContext } from "./item.ts";
import { toast } from "$lib/toast/toast.ts";
import * as stores from "$lib/stores.ts";
import { st } from "./song_tube.ts";
import { db, type AlmostDbItem, type DbOps } from "$lib/local/db.ts";
import { utils as server } from "$lib/server.ts";
import type { AutoplayTyp, AutoplayQueryInfo } from "$lib/local/queue.ts";
import type { SearcherConstructorMapper } from "./searcher.ts";
import * as icons from "$lib/icons.ts";

export type MmSong = Musi.Song<Musi.SongInfo | null>;
export type MmAlbum = Musi.Album<yt.VideoId>;
export type MmArtist = Musi.Artist<yt.VideoId, yt.AlbumId>;
export type MmPlaylist = Musi.Playlist<yt.VideoId>;
export type MmQueue = Musi.Queue<yt.VideoId>;

export type MusicListItem = Keyed & (
    | { id: number, typ: "MmSong", t: MmSong }
    | { id: number, typ: "MmAlbum", t: MmAlbum }
    | { id: number, typ: "MmArtist", t: MmArtist }
    | { id: number, typ: "MmPlaylist", t: MmPlaylist }
    | { id: number, typ: "MmQueue", t: MmQueue }
    | { id: number, typ: "StSong", t: yt.Song }
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

    get_key(): unknown {
        return this.data.get_key();
    }

    song_ids(): string[] {
        switch (this.data.typ) {
            case "MmSong":
                return [this.data.t.key];
            case "StSong":
                return [this.data.t.id];
            case "Song": {
                let song = this.data.t;
                return song.info_sources.map(s => s.content)
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
                return [];
            default:
                throw exhausted(this.data)
        }
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
            case "StAlbum":
                return this.data.t.title ?? this.data.t.id;
            case "StPlaylist":
                return this.data.t.title ?? this.data.t.id;
            case "StArtist":
                return this.data.t.name ?? this.data.t.id;
            case "Song":
                return this.data.t.title;
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
                return this.data.t.info?.thumbnail_url ?? st.get_thumbnail(this.data.t.key);
            case "MmAlbum":
                return null;
            case "MmArtist":
                return null;
            case "MmPlaylist":
                return null;
            case "MmQueue":
                return null;
            case "StSong":
                return this.data.t.thumbnails.at(0)?.url ?? st.get_thumbnail(this.data.t.id);
            case "StAlbum":
                return this.data.t.thumbnails.at(0)?.url ?? null;
            case "StPlaylist":
                return this.data.t.thumbnails.at(0)?.url ?? null;
            case "StArtist":
                return this.data.t.thumbnails.at(0)?.url ?? null;
            case "Song": {
                let song = this.data.t;
                return song.thumbnails.at(0) ?? null;
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
        return icons.default_music_icon;
    }

    title_sub(): string | null {
        function authors(a: string[]) {
            if (a.length == 0) {
                return '';
            } else {
                return a
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
                return authors(this.data.t.authors.map(a => a.name));
            case "StAlbum":
                return this.data.t.author?.name ?? null;
            case "StPlaylist":
                return this.data.t.author?.name ?? null;
            case "StArtist":
                return this.data.t.subscribers ?? null;
            case "Song":
                return authors(this.data.t.artists);
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
                    let data = await st.get_uri(song.key);
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
                let data = await st.get_uri(song.id);
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
                            let data = await st.get_uri(source.content);
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

    async autoplay_query(typ: AutoplayTyp): Promise<AutoplayQueryInfo | null> {
        switch (this.data.typ) {
            case "MmSong": {
                let song = this.data.t;
                switch (typ) {
                    case "MbzRadio":
                    case "StSearchRelated":
                        return {
                            type: typ,
                            title: song.title ?? "",
                            artists: song.artist_name ? [song.artist_name] : [],
                        };
                    case "StRelated": {
                        let song = this.data.t;
                        return {
                            type: "StRelated",
                            id: song.key,
                        };
                    } break;
                    default:
                        throw exhausted(typ);
                }
            } break;
            case "StSong": {
                switch (typ) {
                    case "MbzRadio":
                    case "StSearchRelated":
                        return {
                            type: typ,
                            title: this.data.t.title ?? "",
                            artists: this.data.t.authors.map(a => a.name),
                        };
                    case "StRelated": {
                        let song = this.data.t;
                        return {
                            type: "StRelated",
                            id: song.id,
                        };
                    } break;
                    default:
                        throw exhausted(typ);
                }
            } break;
            case "Song": {
                switch (typ) {
                    case "MbzRadio":
                    case "StSearchRelated":
                        return {
                            type: typ,
                            title: this.data.t.title,
                            artists: this.data.t.artists,
                        };
                    case "StRelated": {
                        let song = this.data.t;
                        for (let source of song.info_sources) {
                            switch (source.type) {
                                case "MbzId":
                                    break;
                                case "YtId": {
                                    return {
                                        type: "StRelated",
                                        id: source.content,
                                    };
                                } break;
                                default:
                                    throw exhausted(source);
                            }
                        }
                        return null;
                    } break;
                    default:
                        throw exhausted(typ);

                }
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
                throw new Error("can't play this. so no autoplay.");
            default:
                throw exhausted(this.data);
        }
    }

    async saved_covau_song(db: DbOps) {
        switch (this.data.typ) {
            case "Song": {
                return this.data;
            } break;
            case "MmSong": {
                let song = this.data.t;

                let vid = await st.get_video(song.key);
                let id: covau.PlaySource = { type: "YtId", content: vid.id };
                let t: covau.Song = {
                    title: vid.title ?? vid.id,
                    artists: vid.authors.map(a => a.name),
                    thumbnails: [...vid.thumbnails.map(t => t.url), st.get_thumbnail(vid.id)],
                    play_sources: [id],
                    info_sources: [id],
                };

                let s1: AlmostDbItem<yt.Song> = { typ: "StSong", t: vid };
                let s2: AlmostDbItem<covau.Song> = { typ: "Song", t };

                await db.insert_or_get(s1);
                let res = await db.insert_or_get(s2);
                return res.content;
            } break;
            case "StSong": {
                let vid = this.data.t;;

                let id: covau.PlaySource = { type: "YtId", content: vid.id };
                let t: covau.Song = {
                    title: vid.title ?? vid.id,
                    artists: vid.authors.map(a => a.name),
                    thumbnails: [...vid.thumbnails.map(t => t.url), st.get_thumbnail(vid.id)],
                    play_sources: [id],
                    info_sources: [id],
                };
                let s: AlmostDbItem<covau.Song> = { typ: "Song", t };

                let res = await db.insert_or_get(s);
                return res.content;
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

    impl_options(ctx: RenderContext): Option[] {
        switch (ctx) {
            case "Queue":
                switch (this.data.typ) {
                    case "MmSong": {
                        let s = this.data.t;
                        return [
                            {
                                icon: icons.play,
                                location: "IconTop",
                                title: "play",
                                onclick: async () => {
                                    await stores.queue_ops.play_item(this);
                                },
                            },
                            {
                                icon: icons.remove,
                                location: "TopRight",
                                title: "remove item",
                                onclick: async () => {
                                    await stores.queue_ops.remove_item(this);
                                },
                            },
                            {
                                icon: icons.copy,
                                location: "OnlyMenu",
                                title: "copy url",
                                onclick: async () => {
                                    await navigator.clipboard.writeText("https://youtu.be/" + s.key);
                                    toast("url copied", "info");
                                },
                            },
                        ];
                    }
                    case "StSong": {
                        let s = this.data.t;
                        return [
                            {
                                icon: icons.play,
                                location: "IconTop",
                                title: "play",
                                onclick: async () => {
                                    await stores.queue_ops.play_item(this);
                                },
                            },
                            {
                                icon: icons.remove,
                                location: "TopRight",
                                title: "remove item",
                                onclick: async () => {
                                    await stores.queue_ops.remove_item(this);
                                },
                            },
                            {
                                icon: icons.copy,
                                location: "OnlyMenu",
                                title: "copy url",
                                onclick: async () => {
                                    await navigator.clipboard.writeText("https://youtu.be/" + s.id);
                                    toast("url copied", "info");
                                },
                            },
                        ];
                    }
                    case "Song":
                        return [
                            {
                                icon: icons.play,
                                location: "IconTop",
                                title: "play",
                                onclick: async () => {
                                    await stores.queue_ops.play_item(this);
                                },
                            },
                            {
                                icon: icons.remove,
                                location: "TopRight",
                                title: "remove item",
                                onclick: async () => {
                                    await stores.queue_ops.remove_item(this);
                                },
                            },
                        ];
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
                                icon: icons.play,
                                location: "IconTop",
                                title: "play",
                                onclick: async () => {
                                    await stores.queue_ops.detour(this);
                                },
                            },
                            {
                                icon: icons.add,
                                location: "TopRight",
                                title: "add to queue",
                                onclick: async () => {
                                    await stores.queue_ops.add_item(this);
                                },
                            },
                            {
                                icon: icons.add,
                                location: "OnlyMenu",
                                title: "remove from queue",
                                onclick: async () => {
                                    await stores.queue_ops.remove_item(this);
                                },
                            },
                            {
                                icon: icons.copy,
                                location: "OnlyMenu",
                                title: "copy url",
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
                                icon: icons.open_new_tab,
                                location: "TopRight",
                                title: "open",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: list.songs,
                                    }, 30);
                                    stores.push_tab(s, list.name);
                                },
                            },
                            {
                                icon: icons.add,
                                location: "OnlyMenu",
                                title: "add all to queue",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: list.songs,
                                    }, list.songs.length);
                                    let items = await s.next_page();
                                    await stores.queue_ops.add_item(...items);
                                },
                            },
                        ];
                    }
                    case "MmArtist": {
                        let a = this.data.t;
                        return [
                            {
                                icon: icons.open_new_tab,
                                location: "TopRight",
                                title: "open saved",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: a.songs,
                                    }, 30);
                                    stores.push_tab(s, a.name + " saved");
                                },
                            },
                            {
                                icon: icons.open_new_tab,
                                location: "OnlyMenu",
                                title: "open unexplored",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: a.unexplored_songs ?? [],
                                    }, 30);
                                    stores.push_tab(s, a.name + " unexplored");
                                },
                            },
                            {
                                icon: icons.add,
                                location: "OnlyMenu",
                                title: "add all saved to queue",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: a.songs,
                                    }, a.songs.length);
                                    let items = await s.next_page();
                                    await stores.queue_ops.add_item(...items);
                                },
                            },
                            {
                                icon: icons.add,
                                location: "OnlyMenu",
                                title: "add all unexplored to queue",
                                onclick: async () => {
                                    let songs = a.unexplored_songs ?? [];
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: songs,
                                    }, songs.length);
                                    let items = await s.next_page();
                                    await stores.queue_ops.add_item(...items);
                                },
                            },
                        ];
                    }
                    case "MmPlaylist":
                    case "MmQueue": {
                        let list = this.data.t;
                        return [
                            {
                                icon: icons.open_new_tab,
                                location: "TopRight",
                                title: "open",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: list.data_list,
                                    }, 30);
                                    stores.push_tab(s, list.name);
                                },
                            },
                            {
                                icon: icons.add,
                                location: "OnlyMenu",
                                title: "add all to queue",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: list.data_list,
                                    }, list.data_list.length);
                                    let items = await s.next_page();
                                    await stores.queue_ops.add_item(...items);
                                },
                            },
                        ];
                    }
                    case "Queue": {
                        let queue = this.data.t;
                        return [
                            {
                                icon: icons.open_new_tab,
                                location: "TopRight",
                                title: "open",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "ids",
                                        type: "Song",
                                        ids: queue.queue.songs,
                                    }, 30);
                                    stores.push_tab(s, queue.queue.title);
                                },
                            },
                            {
                                icon: icons.add,
                                location: "OnlyMenu",
                                title: "add all to queue",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "ids",
                                        type: "Song",
                                        ids: queue.queue.songs,
                                    }, queue.queue.songs.length);
                                    let items = await s.next_page();
                                    await stores.queue_ops.add_item(...items);
                                },
                            },
                        ];
                    } break;
                    case "Song":
                        return [
                            {
                                icon: icons.play,
                                location: "IconTop",
                                title: "play",
                                onclick: async () => {
                                    await stores.queue_ops.detour(this);
                                },
                            },
                            {
                                icon: icons.add,
                                location: "TopRight",
                                title: "add to queue",
                                onclick: async () => {
                                    await stores.queue_ops.add_item(this);
                                },
                            },
                            {
                                icon: icons.add,
                                location: "OnlyMenu",
                                title: "remove from queue",
                                onclick: async () => {
                                    await stores.queue_ops.remove_item(this);
                                },
                            },
                        ];
                    case "StSong": {
                        let s = this.data.t;
                        return [
                            {
                                icon: icons.play,
                                location: "IconTop",
                                title: "play",
                                onclick: async () => {
                                    await stores.queue_ops.detour(this);
                                },
                            },
                            {
                                icon: icons.add,
                                location: "TopRight",
                                title: "add to queue",
                                onclick: async () => {
                                    await stores.queue_ops.add_item(this);
                                },
                            },
                            {
                                icon: icons.add,
                                location: "OnlyMenu",
                                title: "remove from queue",
                                onclick: async () => {
                                    await stores.queue_ops.remove_item(this);
                                },
                            },
                            {
                                icon: icons.copy,
                                location: "OnlyMenu",
                                title: "copy url",
                                onclick: async () => {
                                    await navigator.clipboard.writeText("https://youtu.be/" + s.id);
                                    toast("url copied", "info");
                                },
                            },
                        ];
                    } break;
                    case "Updater": {
                        let u = this.data.t;
                        switch (u.source.type) {
                            case "Mbz":
                                return [];
                            case "MusimanagerSearch":
                            case "SongTubeSearch":
                                let ss = u.source.content;
                                return [
                                    {
                                        icon: icons.open_new_tab,
                                        location: "TopRight",
                                        title: "open",
                                        onclick: async () => {
                                            let s = Db.new({
                                                query_type: "refids",
                                                type: "Song",
                                                ids: ss.songs.queue.map(s => s.item),
                                            }, ss.songs.queue.length);
                                            stores.push_tab(s, u.title);
                                        },
                                    },
                                    {
                                        icon: icons.add,
                                        location: "OnlyMenu",
                                        title: "add all to queue",
                                        onclick: async () => {
                                            let s = Db.new({
                                                query_type: "refids",
                                                type: "Song",
                                                ids: ss.songs.queue.map(s => s.item),
                                            }, ss.songs.queue.length);
                                            let items = await s.next_page();
                                            await stores.queue_ops.add_item(...items);
                                        },
                                    },
                                ];
                            default:
                                throw exhausted(u.source);
                        }
                    } break;
                    case "Playlist":
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

interface IClassTypeWrapper {
    next_page(): Promise<DbListItem[]>;
};
function ClassTypeWrapper<S extends Constructor<{
    next_page(): Promise<MusicListItem[]>;
}>>(s: S) {
    return class extends s implements IClassTypeWrapper {
        // @ts-ignore
        async next_page(): Promise<DbListItem[]> {
            let res = await super.next_page();
            return res.map(m => new DbListItem(m));
        }
    } as Constructor<IClassTypeWrapper> & S; // S has to be after the interface so that it overrides
}

export class Db extends Unpaged<MusicListItem> {
    query: BrowseQuery;
    page_size: number;

    constructor(query: BrowseQuery, page_size: number) {
        super();
        this.query = query;
        this.page_size = page_size;
    }

    static new<W extends SearcherConstructorMapper>(query: BrowseQuery, page_size: number, wrapper: W | null = null) {
        const CW = ClassTypeWrapper(Db);
        const US = UniqueSearch<DbListItem, typeof CW>(CW);
        const SS = SavedSearch<DbListItem, typeof US>(US);
        const AW = AsyncWrapper<DbListItem, typeof SS>(SS);
        if (wrapper) {
            const WR = wrapper(AW) as typeof AW;
            return new WR(query, page_size);
        } else {
            return new AW(query, page_size);
        }
    }

    static unwrapped(query: BrowseQuery, page_size: number) {
        const US = UniqueSearch<MusicListItem, typeof Db>(Db);
        const SS = SavedSearch<MusicListItem, typeof US>(US);
        const AW = AsyncWrapper<MusicListItem, typeof SS>(SS);
        return new AW(query, page_size);
    }

    static fused() {
        let s = Db.new({ type: '' } as unknown as BrowseQuery, 1);
        s.has_next_page = false;
        return s;
    }

    async fetch(query: string): Promise<MusicListItem[]> {
        let q: DB.SearchQuery = {
            type: "Query",
            content: {
                query: query,
                page_size: this.page_size,
            },
        };
        let matches: DB.SearchMatches<unknown> = await server.api_request(
            db.route(this.query.type, "search"),
            q,
        );
        this.cont = matches.continuation;
        if (!this.cont) {
            this.has_next_page = false;
        }
        return matches.items as MusicListItem[];
    }

    options() {
        return [] as Option[];
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
                let matches: DB.SearchMatches<unknown> = await server.api_request(
                    db.route(this.query.type, "search"),
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

            let matches: DB.DbItem<unknown>[] = await server.api_request(
                db.route(this.query.type, "search") + "/refid",
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

            let matches: DB.DbItem<unknown>[] = await server.api_request(
                db.route(this.query.type, "search") + "/dbid",
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
