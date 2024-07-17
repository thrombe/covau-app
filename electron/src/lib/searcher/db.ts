import { DebounceWrapper, SavedSearch, UniqueSearch, Unpaged, type Constructor, DropWrapper } from "./mixins.ts";
import * as Musi from "$types/musimanager.ts";
import * as yt from "$types/yt.ts";
import * as covau from "$types/covau.ts";
import * as DB from "$types/db.ts";
import { exhausted, type Keyed } from "$lib/utils.ts";
import { type Option, ListItem, type RenderContext, type DetailSection, CustomListItem, type OptionsDescription } from "./item.ts";
import { toast } from "$lib/toast/toast.ts";
import * as stores from "$lib/stores.ts";
import { st } from "./song_tube.ts";
import { db, type AlmostDbItem, type DbOps } from "$lib/local/db.ts";
import { utils as server } from "$lib/server.ts";
import type { AutoplayTyp, AutoplayQueryInfo } from "$lib/local/queue.ts";
import { type SearcherConstructorMapper, AsyncStaticSearcher } from "./searcher.ts";
import * as icons from "$lib/icons.ts";
import * as types from "$types/types.ts";
import { writable } from "svelte/store";
import * as utils from "$lib/utils.ts";

export type MmSong = Musi.Song<Musi.SongInfo | null>;
export type MmAlbum = Musi.Album<yt.VideoId>;
export type MmArtist = Musi.Artist<yt.VideoId, yt.AlbumId>;
export type MmPlaylist = Musi.Playlist<yt.VideoId>;
export type MmQueue = Musi.Queue<yt.VideoId>;

export type MusicListItem = Keyed & { id: number, metadata: types.db.DbMetadata } & (
    | { typ: "MmSong", t: MmSong }
    | { typ: "MmAlbum", t: MmAlbum }
    | { typ: "MmArtist", t: MmArtist }
    | { typ: "MmPlaylist", t: MmPlaylist }
    | { typ: "MmQueue", t: MmQueue }
    | { typ: "StSong", t: yt.Song }
    | { typ: "StAlbum", t: yt.Album }
    | { typ: "StPlaylist", t: yt.Playlist }
    | { typ: "StArtist", t: yt.Artist }
    | { typ: "Song", t: covau.Song }
    | { typ: "Playlist", t: covau.Playlist }
    | { typ: "Queue", t: covau.Queue }
    | { typ: "Updater", t: covau.Updater }
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
        return this.data.id;
    }

    typ() {
        return this.data.typ;
    }

    async yt_id(): Promise<string | null> {
        switch (this.data.typ) {
            case "MmSong":
                return this.data.t.key;
            case "StSong":
                return this.data.t.id;
            case "Song": {
                let song = this.data.t;
                for (let source of song.info_sources) {
                    switch (source.type) {
                        case "MbzId":
                            break;
                        case "YtId": {
                            return source.content;
                        } break;
                        default:
                            throw exhausted(source);
                    }
                }
                // TODO: play the first mbz song here
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
                throw exhausted(this.data)
        }
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

    async handle_drop(item: ListItem, target: number | null, is_outsider: boolean): Promise<boolean> {
        const editable_list = (list: number[]) => ({
            items: list,
            get_item_index(item: DB.DbItem<unknown>) {
                for (let i = 0; i < this.items.length; i++) {
                    if (this.items[i] == item.id) {
                        return i;
                    }
                }
                return null;
            },
            move(from: number, to: number) {
                if (from < to) {
                    this.items.splice(to + 1, 0, this.items[from]);
                    this.items.splice(from, 1);
                } else {
                    this.items.splice(to, 0, this.items[from]);
                    this.items.splice(from + 1, 1);
                }
            },
            insert(index: number, dbitem: DB.DbItem<unknown>) {
                if (this.get_item_index(dbitem) != null) {
                    throw new Error(`item "${item.title()}" already in list`);
                }
                this.items.splice(index, 0, dbitem.id);
            },
            move_item(dbitem: DB.DbItem<unknown>, to: number) {
                let index = this.get_item_index(dbitem);
                if (index != null) {
                    this.move(index, to);
                } else {
                    throw new Error(`item "${item.title()}" not in list`);
                }
            },
        });
        const save_in_list = async (list: ReturnType<typeof editable_list>) => {
            if (!item.is_playable()) {
                return false;
            }
            await db.txn(async db => {
                let song = await item.saved_covau_song(db);
                if (song == null) {
                    throw new Error(`can't save item ${item.title()}`);
                }
                if (is_outsider) {
                    if (target == null) {
                        target = list.items.length;
                    }
                    list.insert(target, song);
                } else {
                    if (target == null) {
                        target = list.items.length - 1;
                    }
                    list.move_item(song, target);
                }
                let dbitem = await db.update(this.data as DB.DbItem<unknown>);
                this.data = keyed([dbitem])[0] as MusicListItem;
            });
            return true;
        };

        switch (this.data.typ) {
            case "Playlist": {
                let playlist = this.data.t;
                let list = editable_list(playlist.songs);
                return await save_in_list(list);
            } break;
            case "Queue": {
                let queue = this.data.t;
                let list = editable_list(queue.queue.songs);
                return await save_in_list(list);
            } break;
            case "MmSong":
            case "MmAlbum":
            case "MmArtist":
            case "MmPlaylist":
            case "MmQueue":
            case "StSong":
            case "StAlbum":
            case "StPlaylist":
            case "StArtist":
            case "Song":
            case "Updater":
                return false;
            default:
                throw exhausted(this.data);
        }
    }

    async like(): Promise<void> {
        await this.ops().options.like.onclick();
    }

    async dislike(): Promise<void> {
        await this.ops().options.dislike.onclick();
    }

    protected ops() {
        return {
            options: {
                like: {
                    icon: icons.thumbs_up,
                    title: "like",
                    onclick: async () => {
                        await db.txn(async db => {
                            let item = this.data as DB.DbItem<unknown>;
                            console.log(item);
                            item.metadata.likes += 1;
                            this.data.metadata = await db.update_metadata(item);
                        });
                    },
                },
                dislike: {
                    icon: icons.thumbs_down,
                    title: "dislike",
                    onclick: async () => {
                        await db.txn(async db => {
                            let item = this.data as DB.DbItem<unknown>;
                            item.metadata.dislikes += 1;
                            this.data.metadata = await db.update_metadata(item);
                        });
                    },
                },
                unlike: {
                    icon: icons.thumbs_up,
                    title: "un-like",
                    onclick: async () => {
                        await db.txn(async db => {
                            let item = this.data as DB.DbItem<unknown>;
                            item.metadata.likes -= 1;
                            this.data.metadata = await db.update_metadata(item);
                        });
                    },
                },
                undislike: {
                    icon: icons.thumbs_down,
                    title: "un-dislike",
                    onclick: async () => {
                        await db.txn(async db => {
                            let item = this.data as DB.DbItem<unknown>;
                            item.metadata.dislikes -= 1;
                            this.data.metadata = await db.update_metadata(item);
                        });
                    },
                },
            },
            get_artist_searcher_from_keys: (keys: string[]) => {
                return AsyncStaticSearcher(async () => {
                    return await Promise.all(keys
                        .map(k => {
                            return st
                                .get_artist(k)
                                .then(a => st.get_wrapped_item(a, "Artist"))
                                .catch(err => {
                                    let item = new CustomListItem(k, k, "Custom", utils.err_msg(err));
                                    return item;
                                });
                        }));
                });
            },
        };
    }

    impl_options(ctx: RenderContext): OptionsDescription {
        let common_options = this.common_options();
        let ops = this.ops();

        switch (this.data.typ) {
            case "MmSong": {
                let s = this.data.t;
                let options = {
                    copy_url: {
                        icon: icons.copy,
                        title: "copy url",
                        onclick: async () => {
                            let url = st.get_yt_url(s.key);
                            await navigator.clipboard.writeText(url);
                            toast("url copied", "info");
                        },
                    },
                };

                switch (ctx) {
                    case "Queue":
                        return {
                            icon_top: common_options.queue_play,
                            top_right: common_options.queue_remove_while_in_queue,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
                            menu: [
                                options.copy_url,
                                common_options.open_details,
                            ],
                        };
                    case "Browser":
                        return {
                            icon_top: common_options.detour,
                            top_right: common_options.queue_add,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
                            menu: [
                                options.copy_url,
                                common_options.open_details,
                            ],
                        };
                    case "DetailSection":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                common_options.detour,
                                common_options.queue_add,
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
                                options.copy_url,
                                common_options.refresh_details,
                            ],
                        };
                    case "Playbar":
                        return {
                            ...common_options.empty_ops,
                            bottom: [
                                common_options.open_details,
                                ops.options.like,
                                ops.options.dislike,
                            ],
                        };
                    case "Prompt":
                        return common_options.empty_ops;
                    default:
                        throw exhausted(ctx);
                }
            } break;
            case "StSong": {
                let s = this.data.t;
                let options = st.options.get_song_ops(s);

                switch (ctx) {
                    case "Queue":
                        return {
                            icon_top: common_options.queue_play,
                            top_right: common_options.queue_remove_while_in_queue,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
                            menu: [
                                options.copy_url,
                                ...common_options.open_album(s.album),
                                common_options.open_details,
                            ],
                        };
                    case "Browser":
                        return {
                            icon_top: common_options.detour,
                            top_right: common_options.queue_add,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
                            menu: [
                                options.copy_url,
                                ...common_options.open_album(s.album),
                                common_options.open_details,
                            ],
                        };
                    case "DetailSection":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                common_options.detour,
                                common_options.queue_add,
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
                                options.copy_url,
                                ...common_options.open_album(s.album),
                                common_options.refresh_details,
                            ],
                        };
                    case "Playbar":
                        return {
                            ...common_options.empty_ops,
                            bottom: [
                                common_options.open_details,
                                ops.options.like,
                                ops.options.dislike,
                            ],
                        };
                    case "Prompt":
                        return common_options.empty_ops;
                    default:
                        throw exhausted(ctx);
                }
            } break;
            case "Song": {
                let s = this.data.t;
                let options = {
                    copy_url: {
                        icon: icons.copy,
                        title: "copy source url",
                        onclick: async () => {
                            for (let source of s.play_sources) {
                                switch (source.type) {
                                    case "File": {
                                        continue;
                                    } break;
                                    case "YtId": {
                                        let url = st.get_yt_url(source.content);
                                        await navigator.clipboard.writeText(url);
                                        toast("url copied", "info");
                                        return;
                                    } break;
                                    default:
                                        throw exhausted(source);
                                }
                            }
                            toast("url not found", "info");
                        },
                    },
                };

                switch (ctx) {
                    case "Queue":
                        return {
                            icon_top: common_options.queue_play,
                            top_right: common_options.queue_remove_while_in_queue,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
                            menu: [
                                options.copy_url,
                                common_options.open_details,
                            ],
                        };
                    case "Browser":
                        return {
                            icon_top: common_options.detour,
                            top_right: common_options.queue_add,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
                            menu: [
                                options.copy_url,
                                common_options.open_details,
                            ],
                        };
                    case "DetailSection":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                common_options.detour,
                                common_options.queue_add,
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
                                options.copy_url,
                                common_options.refresh_details,
                            ],
                        };
                    case "Playbar":
                        return {
                            ...common_options.empty_ops,
                            bottom: [
                                common_options.open_details,
                                ops.options.like,
                                ops.options.dislike,
                            ],
                        };
                    case "Prompt":
                        return common_options.empty_ops;
                    default:
                        throw exhausted(ctx);
                }
            } break;
            case "MmAlbum": {
                let a = this.data.t;
                let options = {
                    open: {
                        icon: icons.open_new_tab,
                        title: "open",
                        onclick: async () => {
                            let s = Db.new({
                                query_type: "refids",
                                type: "MmSong",
                                ids: a.songs,
                            }, 30);
                            stores.new_tab(s, a.name);
                        },
                    },
                    add_all_to_queue: {
                        icon: icons.add,
                        title: "add all to queue",
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
                };

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
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
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
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
            case "MmArtist": {
                let a = this.data.t;
                let options = {
                    open_saved: {
                        icon: icons.open_new_tab,
                        title: "open saved",
                        onclick: async () => {
                            let s = Db.new({
                                query_type: "refids",
                                type: "MmSong",
                                ids: a.songs,
                            }, 30);
                            stores.new_tab(s, a.name + " saved");
                        },
                    },
                    open_unexplored: {
                        icon: icons.open_new_tab,
                        title: "open unexplored",
                        onclick: async () => {
                            let s = Db.new({
                                query_type: "refids",
                                type: "MmSong",
                                ids: a.unexplored_songs ?? [],
                            }, 30);
                            stores.new_tab(s, a.name + " unexplored");
                        },
                    },
                    add_saved_to_queue: {
                        icon: icons.add,
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
                    add_all_unexplored_to_queue: {
                        icon: icons.add,
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
                };

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
                            menu: [
                                options.open_saved,
                                options.open_unexplored,
                                options.add_saved_to_queue,
                                options.add_all_unexplored_to_queue,
                                common_options.open_details,
                            ],
                        };
                    case "DetailSection":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                options.open_saved,
                                options.open_unexplored,
                                options.add_saved_to_queue,
                                options.add_all_unexplored_to_queue,
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
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
            case "MmPlaylist":
            case "MmQueue": {
                let list = this.data.t;
                let options = {
                    open: {
                        icon: icons.open_new_tab,
                        title: "open",
                        onclick: async () => {
                            let s = Db.new({
                                query_type: "refids",
                                type: "MmSong",
                                ids: list.data_list,
                            }, 30);
                            stores.new_tab(s, list.name);
                        },
                    },
                    add_all_to_queue: {
                        icon: icons.add,
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
                };

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
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
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
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
            case "Queue": {
                let queue = this.data.t;
                let options = {
                    open: {
                        icon: icons.open_new_tab,
                        title: "open",
                        onclick: async () => {
                            let s = Db.new({
                                query_type: "ids",
                                type: "Song",
                                ids: queue.queue.songs,
                            }, 30, null, this);
                            stores.new_tab(s, queue.queue.title);
                        },
                    },
                    add_all_to_queue: {
                        icon: icons.add,
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
                };

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
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
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
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
                let playlist = this.data.t;
                let options = {
                    open: {
                        icon: icons.open_new_tab,
                        title: "open",
                        onclick: async () => {
                            let s = Db.new({
                                query_type: "ids",
                                type: "Song",
                                ids: playlist.songs,
                            }, 30, null, this);
                            stores.new_tab(s, playlist.title);
                        },
                    },
                    add_all_to_queue: {
                        icon: icons.add,
                        title: "add all to queue",
                        onclick: async () => {
                            let s = Db.new({
                                query_type: "ids",
                                type: "Song",
                                ids: playlist.songs,
                            }, playlist.songs.length);
                            let items = await s.next_page();
                            await stores.queue_ops.add_item(...items);
                        },
                    },
                };

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
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
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
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
            case "Updater": {
                let u = this.data.t;
                switch (u.source.type) {
                    case "MusimanagerSearch": {
                        let ss = u.source.content;
                        let options = {
                            open_songs: {
                                icon: icons.open_new_tab,
                                title: "open songs",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: ss.songs.queue.map(s => s.item),
                                    }, 50);
                                    stores.new_tab(s, u.title);
                                },
                            },
                            open_known_albums: {
                                icon: icons.open_new_tab,
                                title: "open known albums",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmAlbum",
                                        ids: ss.known_albums.map(a => a.item),
                                    }, 50);
                                    stores.new_tab(s, `${u.title} Albums`);
                                },
                            },
                            add_all_to_queue: {
                                icon: icons.add,
                                title: "add all to queue",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: ss.songs.queue.map(s => s.item),
                                    }, 50);
                                    let songs = await s.next_page();
                                    while (s.has_next_page) {
                                        songs = await s.next_page();
                                    }
                                    await stores.queue_ops.add_item(...songs);
                                },
                            },
                            open_sources: {
                                icon: icons.open_new_tab,
                                title: "open sources",
                                onclick: async () => {
                                    let s = ops.get_artist_searcher_from_keys(ss.artist_keys.filter(k => k.length > 0));
                                    stores.new_tab(s, `${u.title} Sources`);
                                },
                            },
                        };

                        switch (ctx) {
                            case "Browser":
                                return {
                                    ...common_options.empty_ops,
                                    bottom: [
                                        ops.options.like,
                                        ops.options.dislike,
                                    ],
                                    menu: [
                                        options.open_songs,
                                        options.open_known_albums,
                                        options.open_sources,
                                        options.add_all_to_queue,
                                        common_options.open_details,
                                    ],
                                };
                            case "DetailSection":
                                return {
                                    ...common_options.empty_ops,
                                    menu: [
                                        options.open_songs,
                                        options.open_known_albums,
                                        options.open_sources,
                                        options.add_all_to_queue,
                                        ops.options.like,
                                        ops.options.dislike,
                                        ops.options.unlike,
                                        ops.options.undislike,
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
                    case "SongTubeSearch": {
                        let ss = u.source.content;
                        let options = {
                            open_songs: {
                                icon: icons.open_new_tab,
                                title: "open songs",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "StSong",
                                        ids: ss.songs.queue.map(s => s.item),
                                    }, 50);
                                    stores.new_tab(s, u.title);
                                },
                            },
                            open_known_albums: {
                                icon: icons.open_new_tab,
                                title: "open known albums",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "StAlbum",
                                        ids: ss.known_albums.map(a => a.item),
                                    }, 50);
                                    stores.new_tab(s, `${u.title} Albums`);
                                },
                            },
                            add_all_to_queue: {
                                icon: icons.add,
                                title: "add all to queue",
                                onclick: async () => {
                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "StSong",
                                        ids: ss.songs.queue.map(s => s.item),
                                    }, 100);
                                    let items = await s.next_page();
                                    while (s.has_next_page) {
                                        items = await s.next_page();
                                    }
                                    await stores.queue_ops.add_item(...items);
                                },
                            },
                        };

                        switch (ctx) {
                            case "Browser":
                                return {
                                    ...common_options.empty_ops,
                                    bottom: [
                                        ops.options.like,
                                        ops.options.dislike,
                                    ],
                                    menu: [
                                        options.open_songs,
                                        options.open_known_albums,
                                        options.add_all_to_queue,
                                        common_options.open_details,
                                    ],
                                };
                            case "DetailSection":
                                return {
                                    ...common_options.empty_ops,
                                    menu: [
                                        options.open_songs,
                                        options.open_known_albums,
                                        options.add_all_to_queue,
                                        ops.options.like,
                                        ops.options.dislike,
                                        ops.options.unlike,
                                        ops.options.undislike,
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
                    case "Mbz":
                        return common_options.empty_ops;
                    default:
                        throw exhausted(u.source);
                }
            } break;
            case "StAlbum": {
                let a = this.data.t;
                let options = st.options.get_album_ops(a);

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
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
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
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
            case "StPlaylist": {
                let p = this.data.t;
                let options = st.options.get_playlist_ops(p);

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
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
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
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
            case "StArtist": {
                let a = this.data.t;
                let options = st.options.get_artist_ops(a);

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
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
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
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
            default:
                throw exhausted(this.data)
        }
    }

    sections(): DetailSection[] {
        let sections = this.common_sections(this.data);
        let maybe = sections.ops.maybe;
        let ops = this.ops();

        switch (this.data.typ) {
            case "Song": {
                let song = this.data.t;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.data.typ,
                            },
                            {
                                heading: "Title",
                                content: song.title,
                            },
                            ...song.artists.map(a => ({
                                heading: "Artist",
                                content: a,
                            })),
                        ]
                    },
                    sections.options,
                    sections.json,
                ] as DetailSection[];
            } break;
            case "MmSong": {
                let song = this.data.t;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.data.typ,
                            },
                            {
                                heading: "Title",
                                content: this.title(),
                            },
                            {
                                heading: "Artist",
                                content: song.artist_name,
                            },
                            {
                                heading: "Key",
                                content: song.key,
                            },
                            ...maybe(song.last_known_path, p => ({
                                heading: "File",
                                content: p,
                            })),
                        ]
                    },
                    sections.options,
                    sections.json,
                ] as DetailSection[];
            } break;
            case "StSong": {
                let song = this.data.t;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.data.typ,
                            },
                            {
                                heading: "Title",
                                content: this.title(),
                            },
                            {
                                heading: "Key",
                                content: song.id,
                            },
                            ...maybe(song.album?.name ?? null, n => ({
                                heading: "Album",
                                content: n,
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
            case "Playlist": {
                let playlist = this.data.t;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.data.typ,
                            },
                            {
                                heading: "Title",
                                content: playlist.title,
                            },
                        ]
                    },
                    sections.options,
                    {
                        type: "Searcher",
                        title: "Songs",
                        options: [],
                        height: Math.min(5, playlist.songs.length),
                        searcher: writable(Db.new({
                            query_type: "ids",
                            type: "Song",
                            ids: playlist.songs,
                        }, 10)),
                    },
                    sections.json,
                ] as DetailSection[];
            } break;
            case "Queue": {
                let queue = this.data.t;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.data.typ,
                            },
                            {
                                heading: "Title",
                                content: queue.queue.title,
                            },
                        ]
                    },
                    sections.options,
                    {
                        type: "Searcher",
                        title: "Songs",
                        options: [],
                        height: Math.min(5, queue.queue.songs.length),
                        searcher: writable(Db.new({
                            query_type: "ids",
                            type: "Song",
                            ids: queue.queue.songs,
                        }, 10)),
                    },
                    sections.json,
                ] as DetailSection[];
            } break;
            case "MmAlbum": {
                let album = this.data.t;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.data.typ,
                            },
                            {
                                heading: "Title",
                                content: this.title(),
                            },
                            {
                                heading: "Artist",
                                content: album.artist_name,
                            },
                            {
                                heading: "Album Id",
                                content: album.browse_id,
                            },
                        ]
                    },
                    sections.options,
                    {
                        type: "Searcher",
                        title: "Songs",
                        options: [],
                        height: Math.min(5, album.songs.length),
                        searcher: writable(Db.new({
                            query_type: "refids",
                            type: "MmSong",
                            ids: album.songs,
                        }, 10)),
                    },
                    sections.json,
                ] as DetailSection[];
            } break;
            case "MmArtist": {
                let artist = this.data.t;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.data.typ,
                            },
                            {
                                heading: "Name",
                                content: artist.name,
                            },
                            ...artist.keys.map(k => ({
                                heading: "Key",
                                content: k,
                            })),
                            ...artist.search_keywords.map(k => ({
                                heading: "Keywords",
                                content: k,
                            })),
                        ]
                    },
                    sections.options,
                    {
                        type: "Searcher",
                        title: "Songs",
                        options: [],
                        height: Math.min(5, artist.songs.length),
                        searcher: writable(Db.new({
                            query_type: "refids",
                            type: "MmSong",
                            ids: artist.songs,
                        }, 10)),
                    },
                    ...maybe(artist.unexplored_songs ?? null, songs => ({
                        type: "Searcher",
                        title: "Unexplored Songs",
                        options: [],
                        height: Math.min(5, songs.length),
                        searcher: writable(Db.new({
                            query_type: "refids",
                            type: "MmSong",
                            ids: artist.songs,
                        }, 10)),
                    })),
                    sections.json,
                ] as DetailSection[];
            } break;
            case "MmPlaylist": {
                let playlist = this.data.t;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.data.typ,
                            },
                            {
                                heading: "Name",
                                content: playlist.name,
                            },
                        ]
                    },
                    sections.options,
                    {
                        type: "Searcher",
                        title: "Songs",
                        options: [],
                        height: Math.min(5, playlist.data_list.length),
                        searcher: writable(Db.new({
                            query_type: "refids",
                            type: "MmSong",
                            ids: playlist.data_list,
                        }, 10)),
                    },
                    sections.json,
                ] as DetailSection[];
            } break;
            case "MmQueue": {
                let queue = this.data.t;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.data.typ,
                            },
                            {
                                heading: "Name",
                                content: queue.name,
                            },
                        ]
                    },
                    sections.options,
                    {
                        type: "Searcher",
                        title: "Songs",
                        options: [],
                        height: Math.min(5, queue.data_list.length),
                        searcher: writable(Db.new({
                            query_type: "refids",
                            type: "MmSong",
                            ids: queue.data_list,
                        }, 10)),
                    },
                    sections.json,
                ] as DetailSection[];
            } break;
            case "StAlbum": {
                let album = this.data.t;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.data.typ,
                            },
                            {
                                heading: "Name",
                                content: album.title,
                            },
                            {
                                heading: "Album Id",
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
            case "StPlaylist": {
                let playlist = this.data.t;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.data.typ,
                            },
                            {
                                heading: "Name",
                                content: playlist.title,
                            },
                            {
                                heading: "Playlist Id",
                                content: playlist.id,
                            },
                            ...maybe(playlist.author?.name ?? null, a => ({
                                heading: "Artist",
                                content: a,
                            })),
                        ]
                    },
                    sections.options,
                    sections.json,
                ] as DetailSection[];
            } break;
            case "StArtist": {
                let artist = this.data.t;
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.data.typ,
                            },
                            {
                                heading: "Name",
                                content: artist.name,
                            },
                            {
                                heading: "Artist Id",
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
            case "Updater": {
                let updater = this.data.t;
                let source = updater.source;
                switch (source.type) {
                    case "MusimanagerSearch":
                    case "SongTubeSearch": {
                        let keys = source.content.artist_keys.filter(k => k.length > 0);
                        let sources = ops.get_artist_searcher_from_keys(keys);
                        return [
                            {
                                type: "Info",
                                info: [
                                    {
                                        heading: "Type",
                                        content: this.data.typ,
                                    },
                                    {
                                        heading: "Name",
                                        content: updater.title,
                                    },
                                    {
                                        heading: "Enabled",
                                        content: updater.enabled.toString(),
                                    },
                                    {
                                        heading: "Updater Type",
                                        content: source.type,
                                    },
                                    ...source.content.search_words.map(w => ({
                                        heading: "Search Word",
                                        content: w,
                                    })),
                                ]
                            },
                            sections.options,
                            {
                                type: "Searcher",
                                title: "Sources",
                                options: [],
                                height: Math.min(5, keys.length),
                                searcher: writable(sources),
                            },
                            {
                                type: "Searcher",
                                title: "Known Albums",
                                options: [],
                                height: Math.min(5, source.content.known_albums.length),
                                searcher: writable(Db.new({
                                    query_type: "refids",
                                    type: "MmAlbum",
                                    ids: source.content.known_albums.map(a => a.item),
                                }, 10)),
                            },
                            {
                                type: "Searcher",
                                title: "Songs",
                                options: [],
                                height: Math.min(5, source.content.songs.queue.length),
                                searcher: writable(Db.new({
                                    query_type: "refids",
                                    type: "MmSong",
                                    ids: source.content.songs.queue.map(a => a.item),
                                }, 10)),
                            },
                            sections.json,
                        ] as DetailSection[];
                    } break;
                    case "Mbz":
                        return [];
                    default:
                        throw exhausted(source);
                }
            } break;
            default:
                throw exhausted(this.data);
        }
    }
}

interface IClassTypeWrapper {
    next_page(): Promise<DbListItem[]>;
};
function ClassTypeWrapper<S extends Constructor<{
    next_page(): Promise<MusicListItem[]>;
}>>(s: S) {
    return class ClassTypeWrapper extends s implements IClassTypeWrapper {
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

        // fix sea orm crash
        // refids / ids is equivalent to
        // select * from _ where id == (a or b or c or ....)
        // so it's not efficient to do it like this anyway
        // TODO: maybe optimise it (and fix the crash). create an intermediate table and join on the refids
        // if (page_size > 500 && (query.query_type == "refids" || query.query_type == "ids")) {
        //     throw new Error(`page size too large: ${page_size}`);
        // }
    }

    static new<W extends SearcherConstructorMapper>(query: BrowseQuery, page_size: number, wrapper: W | null = null, drop_handle: ListItem | null = null) {
        const CW = ClassTypeWrapper(Db);
        const US = UniqueSearch<DbListItem, typeof CW>(CW);
        const SS = SavedSearch<DbListItem, typeof US>(US);
        const AW = DebounceWrapper<DbListItem, typeof SS>(SS);
        const DW = DropWrapper<typeof AW>(AW, drop_handle);
        const W = DW;
        if (wrapper) {
            const WR = wrapper(W) as typeof W;
            return new WR(query, page_size);
        } else {
            return new W(query, page_size);
        }
    }

    static unwrapped(query: BrowseQuery, page_size: number) {
        const US = UniqueSearch<MusicListItem, typeof Db>(Db);
        const SS = SavedSearch<MusicListItem, typeof US>(US);
        const AW = DebounceWrapper<MusicListItem, typeof SS>(SS);
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
