import Innertube, { MusicShelfContinuation, YTMusic, YT, YTNodes, Misc } from "youtubei.js/web";
import { DebounceWrapper, SavedSearch, UniqueSearch, Unpaged, type Constructor, DropWrapper } from "./mixins.ts";
import { exhausted, type Keyed } from "$lib/utils.ts";
import { ListItem, type DetailSection, type Option, type RenderContext, type ItemOptions } from "./item.ts";
import * as stores from "$lib/stores.ts";
import { get } from "svelte/store";
import { toast } from "$lib/toast/toast.ts";
import * as yt from "$types/yt.ts";
import * as covau from "$types/covau.ts";
import { type AlmostDbItem, type DbOps } from "$lib/server.ts";
import type { AutoplayQueryInfo, AutoplayTyp } from "$lib/local/queue.ts";
import type { SearcherConstructorMapper } from "./searcher.ts";
import * as icons from "$lib/icons.ts";
import * as server from "$lib/server.ts";
import * as types from "$types/types.ts";

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

    get_key(): unknown {
        return this.data.get_key();
    }

    typ() {
        switch (this.data.type) {
            case "Song":
                return "YtSong";
            case "Album":
                return "YtAlbum";
            case "Playlist":
                return "YtPlaylist";
            case "Artist":
                return "YtArtist";
            default:
                throw exhausted(this.data)
        }
    }

    async handle_drop(): Promise<boolean> {
        return false;
    }

    song_ids(): types.covau.InfoSource[] {
        switch (this.data.type) {
            case "Song": {
                let song = this.data.content;
                return [{ type: "YtId", content: song.id }];
            } break;
            case "Album":
            case "Playlist":
            case "Artist":
                return [];
            default:
                throw exhausted(this.data)
        }
    }

    artist_ids(): types.covau.InfoSource[] {
        switch (this.data.type) {
            case "Song": {
                return this.data.content.authors
                    .filter(id => !!id.channel_id)
                    .map(id => ({ type: "YtId", content: id.channel_id! }));
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
                return this.data.content.thumbnails.at(0)?.url ?? st.url.song_thumbnail(this.data.content.id);
            case "Album":
            case "Playlist":
            case "Artist":
                return this.data.content.thumbnails.at(0)?.url ?? null;
            default:
                throw exhausted(this.data)
        }
    }

    default_thumbnail(): string {
        return icons.default_music_icon;
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

    async like(): Promise<boolean> {
        return false;
    }

    async dislike(): Promise<boolean> {
        return false;
    }

    async audio_uri() {
        switch (this.data.type) {
            case "Song": {
                let s = this.data.content;
                let data = await st.fetch.uri(this.data.content.id);
                if (!data) {
                    return null;
                }
                this.data.content.thumbnails = data.song.thumbnails;
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

    async yt_id() {
        switch (this.data.type) {
            case "Song": {
                let s = this.data.content;
                return s.id;
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
            case "Song": {
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

    async saved_covau_song(db: DbOps) {
        function not_null<T>(a: (T | null)[]): T[] {
            return a.filter(t => !!t) as T[];
        }
        switch (this.data.type) {
            case "Song": {
                let song = this.data.content;
                let id: covau.PlaySource = { type: "YtId", content: song.id };
                let t: covau.Song = {
                    title: song.title ?? song.id,
                    artists: song.authors.map(a => a.name),
                    thumbnails: [...song.thumbnails.map(t => t.url), st.url.song_thumbnail(song.id)],
                    play_sources: [id],
                    info_sources: [id],
                };

                let s1: AlmostDbItem<unknown> = {typ: "StSong", t: song };
                let s2: AlmostDbItem<covau.Song> = { typ: "Song", t };

                await db.insert_or_get(s1);
                let res =  await db.insert_or_get(s2);
                return res.content;
            } break;
            case "Album":
            case "Playlist":
            case "Artist":
                return null;
            default:
                throw exhausted(this.data);
        }
    }

    impl_options(ctx: RenderContext): ItemOptions {
        let common_options = this.common_options();

        switch (this.data.type) {
            case "Song": {
                let s = this.data.content;
                let options = st.options.get_song_ops(s);

                switch (ctx) {
                    case "Queue":
                        return {
                            ...common_options.empty_ops,
                            icon_top: common_options.queue_play,
                            top_right: common_options.queue_remove_while_in_queue,
                            menu: [
                                options.copy_url,
                                common_options.set_as_seed,
                                common_options.open_details,
                            ],
                        };
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            icon_top: common_options.detour,
                            top_right: common_options.queue_add,
                            menu: [
                                options.copy_url,
                                ...common_options.open_album(s.album),
                                common_options.set_as_seed,
                                common_options.open_details,
                            ],
                        };
                    case "DetailSection":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                common_options.detour,
                                common_options.queue_add,
                                options.copy_url,
                                ...common_options.open_album(s.album),
                                common_options.set_as_seed,
                                common_options.refresh_details,
                            ],
                        };
                    case "Playbar":
                        return {
                            ...common_options.empty_ops,
                            bottom: [
                                common_options.open_details,
                            ],
                        };
                    case "Prompt":
                        return common_options.empty_ops;
                    default:
                        throw exhausted(ctx);
                }
            } break;
            case "Album": {
                let a = this.data.content;
                let options = st.options.get_album_ops(a);

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                options.open,
                                options.add_all_to_queue,
                                common_options.open_details,
                            ],
                        };
                    case "DetailSection":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                options.open,
                                options.add_all_to_queue,
                                common_options.refresh_details,
                            ],
                        };
                    case "Queue":
                    case "Playbar":
                    case "Prompt":
                        return common_options.empty_ops;
                    default:
                        throw exhausted(ctx);
                }
            } break;
            case "Playlist": {
                let p = this.data.content;
                let options = st.options.get_playlist_ops(p);

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                options.open,
                                common_options.open_details,
                            ],
                        };
                    case "DetailSection":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                options.open,
                                common_options.refresh_details,
                            ],
                        };
                    case "Queue":
                    case "Playbar":
                    case "Prompt":
                        return common_options.empty_ops;
                    default:
                        throw exhausted(ctx);
                }
            } break;
            case "Artist": {
                let a = this.data.content;
                let options = st.options.get_artist_ops(a);

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                ...options.explore_songs(),
                                ...options.explore_releases(),
                                options.copy_channel_url,
                                options.copy_artist_url,
                                common_options.open_details,
                            ],
                        };
                    case "DetailSection":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                ...options.explore_songs(),
                                ...options.explore_releases(),
                                options.copy_channel_url,
                                options.copy_artist_url,
                                common_options.refresh_details,
                            ],
                        };
                    case "Queue":
                    case "Playbar":
                    case "Prompt":
                        return common_options.empty_ops;
                    default:
                        throw exhausted(ctx);
                }
            } break;
                break
            default:
                throw exhausted(this.data);
        }
    }

    sections(): DetailSection[] {
        let sections = this.common_sections(this.data);
        let maybe = sections.ops.maybe;

        switch (this.data.type) {
            case "Song": {
                let song = this.data.content;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.typ(),
                            },
                            {
                                heading: "Title",
                                content: song.title,
                            },
                            {
                                heading: "VideoId",
                                content: song.id,
                            },
                            ...maybe(song.album?.name ?? null, a => ({
                                heading: "Album",
                                content: a,
                            })),
                            ...song.authors.map(a => ({
                                heading: "Artist",
                                content: a.name,
                            })),
                        ]
                    },
                    sections.options,
                    sections.json,
                ] as DetailSection[];
            } break;
            case "Album": {
                let album = this.data.content;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.typ(),
                            },
                            {
                                heading: "Title",
                                content: album.title,
                            },
                            {
                                heading: "AlbumId",
                                content: album.id,
                            },
                            ...maybe(album.author?.name ?? null, a => ({
                                heading: "Artist",
                                content: a,
                            })),
                        ]
                    },
                    sections.options,
                    sections.json,
                ] as DetailSection[];
            } break;
            case "Playlist": {
                let list = this.data.content;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.typ(),
                            },
                            {
                                heading: "Title",
                                content: list.title,
                            },
                            {
                                heading: "PlaylistId",
                                content: list.id,
                            },
                            ...maybe(list.author?.name ?? null, a => ({
                                heading: "Artist",
                                content: a,
                            })),
                        ]
                    },
                    sections.options,
                    sections.json,
                ] as DetailSection[];
            } break;
            case "Artist": {
                let artist = this.data.content;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.typ(),
                            },
                            {
                                heading: "Name",
                                content: artist.name,
                            },
                            {
                                heading: "ArtistId",
                                content: artist.id,
                            },
                            ...maybe(artist.subscribers, a => ({
                                heading: "Subscribers",
                                content: a,
                            })),
                        ]
                    },
                    sections.options,
                    sections.json,
                ] as DetailSection[];
            } break;
            default:
                throw exhausted(this.data);
        }
    }
}

interface IClassTypeWrapper {
    next_page(): Promise<StListItem[]>;
};
function ClassTypeWrapper<S extends Constructor<{
    next_page(): Promise<(MusicListItem & Keyed)[]>;
}>>(s: S) {
    return class ClassTypeWrapper extends s implements IClassTypeWrapper {
        // @ts-ignore
        async next_page(): Promise<StListItem[]> {
            let res = await super.next_page();
            return res.map(m => new StListItem(m));
        }
    } as Constructor<IClassTypeWrapper> & S;
}

export const st = {
    fetch: {
        async try_uri(id: string) {
            let tube = get(stores.tube);
            let vinfo = await tube.getInfo(id);
            console.log(vinfo);
            let format = vinfo.chooseFormat({
                type: 'audio',
                quality: 'best',
                format: 'opus',
                client: 'YTMUSIC_ANDROID',
            });
            console.log(format);
            // let url = d.getStreamingInfo();
            let uri = format.decipher(tube.session.player);
            console.log(uri);

            let info: yt.SongUriInfo = {
                song: st.parse.st_song(vinfo),
                uri,
                approx_duration_ms: format.approx_duration_ms,
                content_length: format.content_length!,
                mime_type: format.mime_type,
            };
            return info;
        },

        async uri(id: string) {
            try {
                return await this.try_uri(id);
            } catch (e) {
                console.error(e);
                return null;
            }
        },

        // TODO: fetch info from cache first. sqlite db cache on app, browser storage on web
        async video(id: string): Promise<yt.Song> {
            let s = await get(stores.tube).getBasicInfo(id);
            return st.parse.st_song(s);
        },

        async artist(id: string): Promise<yt.Artist> {
            let a = await get(stores.tube).getChannel(id);
            return {
                id,
                typ: (!!a.metadata.music_artist_name) ? "Artist" : "Channel",
                name: a.metadata.music_artist_name ?? a.metadata.title ?? id,
                subscribers: null,
                thumbnails: st.parse.thumbnails(a.metadata.thumbnail),
            };
        },

        async album_playlist_id(id: string) {
            let a3 = await get(stores.tube).music.getAlbum(id);
            if (a3.url) {
                let u = new URL(a3.url);
                return u.searchParams.get("list") ?? null;
            } else {
                return null;
            }
        },

        // async download_song(id: string) {
        //     let itube = get(stores.tube);
        //     try {
        //         let d = await itube.getInfo(id);
        //         // OOF: 403 forbidden :/
        //         let file = await d.download({
        //             type: "audio",
        //             quality: "best",
        //             format: "any",
        //             client: "YTMUSIC_ANDROID",
        //         });
        //         console.log(await file.getReader().read())
        //     } catch (e) {
        //         console.error(e);
        //         return null;
        //     }
        // },
    },

    cached: {
        async video(id: string) {
            let v = await server.db.get_by_refid<yt.Song>("StSong", id);
            if (v == null) {
                let item = await st.fetch.video(id);
                let dbitem = await server.db.txn(async db => {
                    return await db.insert_or_get({ typ: "StSong", t: item });
                });
                return item;
            } else {
                return v.t;
            }
        },
        async artist(id: string) {
            let v = await server.db.get_by_refid<yt.Artist>("StArtist", id);
            if (v == null) {
                let item = await st.fetch.artist(id);
                let dbitem = await server.db.txn(async db => {
                    return await db.insert_or_get({ typ: "StArtist", t: item });
                });
                return item;
            } else {
                return v.t;
            }
        },
    },

    url: {
        song_thumbnail(id: string) {
            return `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
        },

        video(id: string) {
            return `https://www.youtube.com/watch?v=${id}`;
        },

        channel(artist_id: string) {
            return `https://www.youtube.com/channel/${artist_id}`;
        },

        artist(artist_id: string) {
            return `https://music.youtube.com/channel/${artist_id}`;
        },
    },

    parse: {
        st_song(s: YTNodes.PlaylistPanelVideo | YTNodes.MusicResponsiveListItem | VideoInfo) {
            if (s instanceof YT.VideoInfo) {
                if (!s.basic_info.id) {
                    throw new Error(s.playability_status.status);
                }
                return {
                    id: s.basic_info.id,
                    title: s.basic_info.title ?? null,
                    thumbnails: this.thumbnails(s.basic_info.thumbnail),
                    album: null,
                    authors: s.basic_info.author ? [
                        {
                            name: s.basic_info.author,
                            channel_id: s.basic_info.channel_id ?? null
                        }
                    ] : [],
                };
            } else if (s.is(YTNodes.MusicResponsiveListItem)) {
                return {
                    id: s.id!,
                    title: s.title ?? null,
                    thumbnails: this.thumbnails(s.thumbnail),
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
                    thumbnails: this.thumbnails(s.thumbnail),
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
        thumbnails(node: Misc.Thumbnail[] | YTNodes.MusicThumbnail | null | undefined): MusicListItem['content']['thumbnails'] {
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
        },

        wrap_items<T extends { id?: any }>(items: T[], typ: MusicListItem["type"]): StListItem[] {
            let k = keyed(items.map(e => ({ type: typ, content: e as unknown } as MusicListItem)));
            return k.map(e => new StListItem(e))
        },

        wrap_item<T extends { id?: any }>(item: T, typ: MusicListItem["type"]): StListItem {
            return new StListItem(keyed([{ type: typ, content: item as unknown } as MusicListItem])[0])
        },
    },

    options: {
        get_song_ops: (s: yt.Song) => ({
            copy_url: {
                icon: icons.copy,
                title: "copy url",
                onclick: async () => {
                    let url = st.url.video(s.id);
                    await navigator.clipboard.writeText(url);
                    toast("url copied", "info");
                },
            },
        }),
        get_album_ops: (a: yt.Album) => ({
            open: {
                icon: icons.open_new_tab,
                title: "open",
                onclick: async () => {
                    let s = SongTube.new({
                        type: "Album",
                        content: a.id,
                    });
                    stores.new_tab(s, "Album " + a.title, a.thumbnails.at(0)?.url ?? null);
                },
            },
            add_all_to_queue: {
                icon: icons.add,
                title: "add all to queue",
                onclick: async () => {
                    let s = SongTube.new({
                        type: "Album",
                        content: a.id,
                    });
                    let items = await s.next_page();
                    await stores.queue_ops.add_item(...items);
                },
            },
        }),
        get_playlist_ops: (p: yt.Playlist) => ({
            open: {
                icon: icons.open_new_tab,
                title: "open",
                onclick: async () => {
                    let s = SongTube.new({
                        type: "Playlist",
                        content: p.id,
                    });
                    stores.new_tab(s, "Playlist " + p.title, p.thumbnails.at(0)?.url ?? null);
                },
            },
        }),
        get_artist_ops: (a: yt.Artist) => ({
            copy_channel_url: {
                icon: icons.copy,
                title: "copy channel url",
                onclick: async () => {
                    let url = st.url.channel(a.id);
                    await navigator.clipboard.writeText(url);
                    toast("url copied", "info");
                },
            },
            copy_artist_url: {
                icon: icons.copy,
                title: "copy artist url",
                onclick: async () => {
                    let url = st.url.artist(a.id);
                    await navigator.clipboard.writeText(url);
                    toast("url copied", "info");
                },
            },
            explore_songs: () => {
                if (a.typ == "Artist") {
                    return [{
                        icon: icons.open_new_tab,
                        title: "explore songs",
                        onclick: async () => {
                            let s = SongTube.new({
                                type: "ArtistSongs",
                                content: a.id,
                            });
                            stores.new_tab(s, "Artist " + a.name + " songs", a.thumbnails.at(0)?.url ?? null);
                        },
                    }];
                } else {
                    return [];
                }
            },
            explore_releases: () => {
                if (a.typ == "Channel") {
                    return [{
                        icon: icons.open_new_tab,
                        title: "explore releases",
                        onclick: async () => {
                            let s = SongTube.new({
                                type: "ArtistReleases",
                                content: a.id,
                            });
                            stores.new_tab(s, "Artist " + a.name + " releases", a.thumbnails.at(0)?.url ?? null);
                        },
                    }];
                } else {
                    return [];
                }
            },
        }),
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

    static new<W extends SearcherConstructorMapper>(query: BrowseQuery, wrapper: W | null = null, drop_handle: ListItem | null = null) {
        const CW = ClassTypeWrapper(SongTube)
        const US = UniqueSearch<StListItem, typeof CW>(CW);
        const SS = SavedSearch<StListItem, typeof US>(US);
        const AW = DebounceWrapper<StListItem, typeof SS>(SS);
        const DW = DropWrapper<typeof AW>(AW, drop_handle);
        const W = DW;
        if (wrapper) {
            const WR = wrapper(W) as typeof W;
            return new WR(query);
        } else {
            return new W(query);
        }
    }

    static unwrapped(query: BrowseQuery) {
        const US = UniqueSearch<MusicListItem & Keyed, typeof SongTube>(SongTube);
        const SS = SavedSearch<MusicListItem, typeof US>(US);
        const AW = DebounceWrapper<MusicListItem, typeof SS>(SS);
        return new AW(query);
    }

    options(): Option[] {
        return [];
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
        } else if (this.query.type == "VideoSearch") {
            return await this.next_page_search(this.query.content.query, "YtVideo");
        } else if (this.query.type == "ChannelSearch") {
            return await this.next_page_channel_search(this.query.content.query);
        } else if (this.query.type == 'ArtistSongs') {
            let r = await this.next_page_artist_songs(this.query.content);
            return r;
        } else if (this.query.type == 'ArtistReleases') {
            let r = await this.next_page_artist_releases(this.query.content);
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
            return st.cached.video(id).then(s => ({
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
            content: st.parse.st_song(s),
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
            content: st.parse.st_song(s),
        }));
        return keyed(mli) as RObject[];
    }
    releases: YT.Channel | null = null;
    releases_cont: YT.ChannelListContinuation | null = null;
    protected async next_page_artist_releases(artist_id: string) {
        let items: YTNodes.Playlist[] = [];
        if (this.releases_cont) {
            this.releases_cont = await this.releases_cont.getContinuation();

            items = this.releases_cont.contents?.contents?.filterType(YTNodes.RichItem).map(s => s.content.as(YTNodes.Playlist)) ?? [];
            this.has_next_page = this.releases_cont.has_continuation;
        } else if (this.releases) {
            this.releases_cont = await this.releases.getContinuation();

            items = this.releases_cont.contents?.contents?.filterType(YTNodes.RichItem).map(s => s.content.as(YTNodes.Playlist)) ?? [];
            this.has_next_page = this.releases_cont.has_continuation;
        } else {
            let artist = await this.tube.getChannel(artist_id);
            if (artist.has_releases) {
                this.releases = await artist.getReleases();
                console.log(this.releases);
                this.has_next_page = this.releases.has_continuation;
                items = this.releases?.playlists?.filterType(YTNodes.Playlist) ?? [];
            }
        }
        if (this.has_next_page) {
            if (items.length == 0) {
                this.has_next_page = false;
                return [];
            }
        }

        let mli: MusicListItem[] = items.map(s => ({
            type: 'Playlist',
            content: {
                id: s.id,
                title: s.title.text ?? s.id,
                thumbnails: st.parse.thumbnails(s.thumbnails),
                author: (() => {
                    if ("id" in s.author) {
                        return {
                            name: s.author.name,
                            id: s.author.id ?? null,
                        };
                    } else if (s.author.text) {
                        return {
                            name: s.author.text!,
                            id: null,
                        };
                    } else {
                        return null;
                    }
                })(),
            } as yt.Playlist,
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
            content: st.parse.st_song(s),
        }));
        return keyed(mli) as RObject[];
    }
    protected async next_page_album(album_id: string) {
        this.has_next_page = false;
        let a = await this.tube.music.getAlbum(album_id);
        let mli: MusicListItem[] = a.contents.map(s => ({
            type: 'Song',
            content: st.parse.st_song(s),
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
    channel_results: YT.Search | null = null;
    protected async next_page_channel_search(query: string) {
        if (query.length == 0) {
            this.has_next_page = false;
            return [];
        }

        let items: Array<YTNodes.Channel> = [];
        if (this.channel_results == null) {
            this.channel_results = await this.tube.search(query, { type: "channel" });

            if (!this.channel_results.results) {
                this.has_next_page = false;
                return [];
            }

            items = this.channel_results.results.filterType(YTNodes.Channel).map(a => a);
        } else {
            this.channel_results = await this.channel_results.getContinuation();

            if (!this.channel_results.results) {
                this.has_next_page = false;
                return [];
            }

            items = this.channel_results.results.filterType(YTNodes.Channel).map(a => a);
        }
        
        let mli: MusicListItem[] = items.map(ch => ({
            type: "Artist",
            content: {
                id: ch.id,
                typ: "Channel",
                thumbnails: st.parse.thumbnails(ch.author.thumbnails),
                name: ch.author.name ?? ch.id,
                subscribers: ch.video_count.text ?? ch.subscriber_count.text ?? null,
            },
        }));
        let k = keyed(mli);
        return k as RObject[];
    }
    protected async next_page_search(query: string, typ: Typ | "YtVideo") {
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
                    content: st.parse.st_song(e),
                }
            } else if (e.item_type === 'video') {
                return {
                    type: 'Song',
                    content: {
                        id: e.id!,
                        title: e.title ?? null,
                        thumbnails: st.parse.thumbnails(e.thumbnail),
                        authors: e.authors?.map(a => ({
                            name: a.name,
                            channel_id: a.channel_id ?? null,
                        })) ?? [],
                        album: null,
                    }
                }
            } else if (e.item_type === 'album') {
                return {
                    type: 'Album',
                    content: {
                        id: e.id!,
                        title: e.title ?? null,
                        thumbnails: st.parse.thumbnails(e.thumbnail),
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
                        thumbnails: st.parse.thumbnails(e.thumbnail),
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
                        typ: "Artist",
                        name: e.name ?? null,
                        thumbnails: st.parse.thumbnails(e.thumbnail),
                        subscribers: e.subscribers ?? null,
                    }
                }
            } else {
                return {
                    type: 'Song',
                    content: {
                        id: e.id!,
                        title: e.title ?? null,
                        thumbnails: st.parse.thumbnails(e.thumbnail),
                        authors: [],
                        album: null,
                    }
                };
            }
        });
        let k = keyed(mli);

        this.has_next_page = this.results.has_continuation;
        return k as RObject[];
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
