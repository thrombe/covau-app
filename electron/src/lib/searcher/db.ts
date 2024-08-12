import * as Musi from "$types/musimanager.ts";
import * as yt from "$types/yt.ts";
import * as covau from "$types/covau.ts";
import * as DB from "$types/db.ts";
import { exhausted, type Keyed } from "$lib/utils.ts";
import { type Option, ListItem, type RenderContext, type DetailSection, CustomListItem, type ItemOptions } from "./item.ts";
import { toast } from "$lib/toast/toast.ts";
import * as stores from "$lib/stores.ts";
import { st } from "./song_tube.ts";
import * as server from "$lib/server.ts";
import type { AutoplayTyp, AutoplayQueryInfo } from "$lib/local/queue.ts";
import { type SearcherConstructorMapper, AsyncStaticSearcher } from "./searcher.ts";
import * as icons from "$lib/icons.ts";
import * as types from "$types/types.ts";
import { get, writable } from "svelte/store";
import * as utils from "$lib/utils.ts";
import * as mbz from "$lib/searcher/mbz.ts";
import * as mixins from "$lib/searcher/mixins.ts";
import { prompter } from "$lib/prompt/prompt.ts";
import * as rc from "$lib/rc.ts";

export type MmSong = Musi.Song<Musi.SongInfo | null, types.covau.SourcePath>;
export type MmAlbum = Musi.Album<yt.VideoId>;
export type MmArtist = Musi.Artist<yt.VideoId, yt.AlbumId>;
export type MmPlaylist = Musi.Playlist<yt.VideoId>;
export type MmQueue = Musi.Queue<yt.VideoId>;

export type MusicListItem = { id: number, metadata: types.db.DbMetadata } & (
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
    | { typ: "LocalState", t: covau.LocalState }
    | { typ: "ArtistBlacklist", t: covau.ArtistBlacklist }
    | { typ: "SongBlacklist", t: covau.SongBlacklist }
    | { typ: "MbzArtist", t: types.mbz.Artist }
    | { typ: "MbzRecording", t: types.mbz.RecordingWithInfo }
);
type KeyedMusicListItem = Keyed & MusicListItem;

export type Typ = DB.Typ;
export type BrowseQuery =
    { query_type: 'search', type: Typ, query: string } |
    { query_type: 'refids', type: Typ, ids: string[] } |
    { query_type: 'dynamic-refids', query: { refid: string, typ: Typ }[] } |
    { query_type: 'ids', type: Typ | null, ids: number[] };

export class DbListItem extends ListItem {
    _t: rc.Rc<MusicListItem>;

    // for mbz recording
    yt_song: types.yt.Song | null = null;

    constructor(data: MusicListItem) {
        super();
        this._t = rc.rc.store.rc(data) as typeof this._t;
    }

    dbrc<T extends MusicListItem["t"]>() {
        return this._t as rc.DbRc<T>;
    }

    rc<T extends types.db.DbItem<unknown>>() {
        return this._t as rc.Rc<T>;
    }

    get t(): rc.Rc<MusicListItem> {
        return this._t;
        // switch (this.t.t.typ) {
        //     case "MmSong": {
        //         let t: rc.Rc<typeof this.t.t> = this.t as typeof t;
        //         let t = this.rc<MmSong>();
        //     } break;
        //     default: {} break;
        // }
    }

    set t(t: MusicListItem | types.db.DbItem<unknown>) {
        this._t.t = t as MusicListItem;
    }

    get_key(): unknown {
        return this.t.id;
    }

    typ() {
        return this.t.t.typ;
    }

    drag_url() {
        let t = this.t.t;
        switch (t.typ) {
            case "MmSong": {
                return st.url.video(t.t.key);
            } break;
            case "StSong": {
                return st.url.video(t.t.id);
            } break;
            case "Song": {
                let song = t.t;
                for (let source of song.info_sources) {
                    switch (source.type) {
                        case "MbzId": {
                            return mbz.mbz.urls.recording.mbz(source.content);
                        } break;
                        case "YtId": {
                            return st.url.video(source.content);
                        } break;
                        default:
                            throw exhausted(source);
                    }
                }
                return null;
            } break;
            case "MbzRecording": {
                return mbz.mbz.urls.recording.mbz(t.t.id);
            } break;
            case "StArtist": {
                if (t.t.typ == "Artist") {
                    return st.url.artist(t.t.id);
                } else {
                    return st.url.channel(t.t.id);
                }
            } break;
            case "MbzArtist": {
                return mbz.mbz.urls.artist.mbz(t.t.id);
            } break;
            case "MmArtist":
            case "MmAlbum":
            case "MmPlaylist":
            case "MmQueue":
            case "StAlbum":
            case "StPlaylist":
            case "Playlist":
            case "Queue":
            case "Updater":
            case "ArtistBlacklist":
            case "SongBlacklist":
            case "LocalState":
                return null;
            default:
                throw exhausted(t);
        }
    }

    async yt_id(): Promise<string | null> {
        let t = this.t.t;
        switch (t.typ) {
            case "MmSong":
                return t.t.key;
            case "StSong":
                return t.t.id;
            case "Song": {
                let song = t.t;
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
            case "MbzRecording": {
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
            case "ArtistBlacklist":
            case "SongBlacklist":
            case "MbzArtist":
            case "LocalState":
                return null;
            default:
                throw exhausted(t);
        }
    }

    song_ids(): types.covau.InfoSource[] {
        let t = this.t.t;
        switch (t.typ) {
            case "MmSong":
                return [{ type: "YtId", content: t.t.key }];
            case "StSong":
                return [{ type: "YtId", content: t.t.id }];
            case "Song": {
                let song = t.t;
                return utils.clone(song.info_sources);
            } break;
            case "MbzRecording": {
                return [{ type: "MbzId", content: t.t.id }];
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
            case "ArtistBlacklist":
            case "SongBlacklist":
            case "MbzArtist":
            case "LocalState":
                return [];
            default:
                throw exhausted(t);
        }
    }

    artist_ids(): types.covau.InfoSource[] {
        let sections = this.common_sections(this.t.t);
        let maybe = sections.ops.maybe;
        let t = this.t.t;
        switch (t.typ) {
            case "MmSong":
                return maybe(t.t.info?.channel_id ?? null, id => ({ type: "YtId", content: id }));
            case "StSong":
                return t.t.authors
                    .filter(id => !!id.channel_id)
                    .map(id => ({ type: "YtId", content: id.channel_id! }));
            case "Song": {
                return t.t.artists
                    .filter(a => a.source != null)
                    .map(a => a.source as types.covau.InfoSource);
            } break;
            case "MbzRecording": {
                return t.t.credit.map(a => ({ type: "MbzId", content: a.id }));
            } break;
            case "MbzArtist": {
                return [{ type: "MbzId", content: t.t.id }];
            } break;
            case "StArtist": {
                return [{ type: "YtId", content: t.t.id }];
            } break;
            case "MmArtist":
            case "MmAlbum":
            case "MmPlaylist":
            case "MmQueue":
            case "StAlbum":
            case "StPlaylist":
            case "Playlist":
            case "Queue":
            case "Updater":
            case "ArtistBlacklist":
            case "SongBlacklist":
            case "LocalState":
                return [];
            default:
                throw exhausted(t);
        }
    }

    title(): string {
        let t = this.t.t;
        switch (t.typ) {
            case "MmAlbum":
            case "MmArtist":
            case "MmPlaylist":
            case "MmQueue":
            case "MbzArtist":
                return t.t.name;
            case "StSong":
            case "StAlbum":
            case "StPlaylist":
                return t.t.title ?? t.t.id;
            case "StArtist":
                return t.t.name ?? t.t.id;
            case "MmSong":
            case "Song":
            case "Playlist":
            case "Updater":
            case "MbzRecording":
                return t.t.title;
            case "Queue":
                return t.t.queue.queue.title;
            case "ArtistBlacklist":
                return t.t.title ?? `${t.t.artists.length} Artists`;
            case "SongBlacklist":
                return t.t.title ?? `${t.t.songs.length} Songs`;
            case "LocalState":
                return "Local State";
            default:
                throw exhausted(t);
        }
    }

    thumbnail(): string | null {
        let t = this.t.t;
        switch (t.typ) {
            case "MmSong":
                return t.t.info?.thumbnail_url ?? st.url.song_thumbnail(t.t.key).url;
            case "MmAlbum":
                return null;
            case "MmArtist":
                return null;
            case "MmPlaylist":
                return null;
            case "MmQueue":
                return null;
            case "StSong":
                return t.t.thumbnails.at(0)?.url ?? st.url.song_thumbnail(t.t.id).url;
            case "Song":
            case "StAlbum":
            case "StPlaylist":
            case "StArtist":
                return t.t.thumbnails.at(0)?.url ?? null;
            case "MbzArtist":
                return null;
            case "MbzRecording":
                return t.t.cover_art;
            case "Playlist":
                return null;
            case "Queue":
                return null;
            case "Updater":
                return null;
            case "ArtistBlacklist":
                return null;
            case "SongBlacklist":
                return null;
            case "LocalState":
                return null;
            default:
                throw exhausted(t);
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

        let t = this.t.t;
        switch (t.typ) {
            case "MmSong":
            case "MmAlbum":
                return t.t.artist_name;
            case "MmArtist":
                return null;
            case "MmPlaylist":
            case "MmQueue":
                return t.t.data_list.length.toString() + " songs";
            case "StSong":
                return authors(t.t.authors.map(a => a.name));
            case "StAlbum":
            case "StPlaylist":
                return t.t.author?.name ?? null;
            case "StArtist":
                return t.t.subscribers ?? null;
            case "Song":
                return authors(t.t.artists.map(a => a.name));
            case "MbzArtist":
                return t.t.disambiguation ?? authors(t.t.aliases.map(a => a.name))
            case "MbzRecording":
                return authors(t.t.credit.map(a => a.name));
            case "LocalState":
                return `item number ${t.id}`;
            case "Playlist":
                return `${t.t.songs.length} items`;
            case "Updater":
                return null;
            case "Queue":
                return `${t.t.queue.queue.songs.length} items`;
            case "ArtistBlacklist":
                return `${t.t.artists.length} Artists`;
            case "SongBlacklist":
                return `${t.t.songs.length} Songs`;
            default:
                throw exhausted(t);
        }
    }

    async audio_uri(): Promise<string | null> {
        let mbz_ops = mbz.mbz.ops(this);
        let t = this.t.t;
        switch (t.typ) {
            case "MmSong": {
                let s = this.dbrc<MmSong>();
                if (s.t.t.last_known_path) {
                    return "file://" + await server.api.to_path(s.t.t.last_known_path);
                } else {
                    let data = await st.fetch.uri(s.t.t.key);
                    if (!data) {
                        return null;
                    }
                    let thumbs = data.song.thumbnails;
                    if (thumbs.length > 0 && !s.t.t.info?.thumbnail_url) {
                        await s.txn(async s => {
                            if (s.t.info) {
                                s.t.info.thumbnail_url = thumbs[0].url;
                            } else {
                                s.t.info = {
                                    duration: null,
                                    tags: [],
                                    album: null,
                                    artist_names: [], // TODO: data.info.basic_info.author?
                                    channel_id: data.song.authors.at(0)?.channel_id ?? '',
                                    uploader_id: null,
                                    video_id: s.t.key,
                                    titles: [s.t.title],
                                    thumbnail_url: thumbs[0].url,
                                };
                            }
                            return s;
                        });
                    }
                    return data.uri;
                }
            } break;
            case "StSong": {
                let data = await st.fetch.uri(t.t.id);
                if (!data) {
                    return null;
                }
                return data.uri;
            } break;
            case "Song": {
                let song = t.t;
                for (let source of song.play_sources) {
                    switch (source.type) {
                        case "File":
                            return "file://" + await server.api.to_path(source.content);
                        case "YtId": {
                            let data = await st.fetch.uri(source.content);
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
            case "MbzRecording": {
                let song = utils.clone(t.t);
                return await mbz_ops.play_recording(song, "song");
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
            case "LocalState":
            case "ArtistBlacklist":
            case "SongBlacklist":
            case "MbzArtist":
                return null;
            default:
                throw exhausted(t);
        }
    }

    source_path(): covau.SourcePath | null {
        let t = this.t.t;
        switch (t.typ) {
            case "Song": {
                let song = t.t;
                for (let source of song.play_sources) {
                    switch (source.type) {
                        case "File":
                            return source.content;
                        case "YtId": {
                        } break;
                        default:
                            throw exhausted(source);
                    }
                }
                return null;
            } break;
            case "MmSong":
                return t.t.last_known_path;
            case "MmAlbum":
            case "MmArtist":
            case "MmPlaylist":
            case "MmQueue":
            case "StSong":
            case "StAlbum":
            case "StPlaylist":
            case "StArtist":
            case "Playlist":
            case "Queue":
            case "Updater":
            case "LocalState":
            case "ArtistBlacklist":
            case "SongBlacklist":
            case "MbzArtist":
            case "MbzRecording":
                return null;
            default:
                throw exhausted(t);
        }
    }

    async autoplay_query(typ: AutoplayTyp): Promise<AutoplayQueryInfo | null> {
        let t = this.t.t;
        switch (t.typ) {
            case "MmSong": {
                switch (typ) {
                    case "MbzRadio":
                    case "StSearchRelated":
                        return {
                            type: typ,
                            title: t.t.title ?? "",
                            artists: t.t.artist_name ? [t.t.artist_name] : [],
                        };
                    case "StRelated": {
                        return {
                            type: "StRelated",
                            id: t.t.key,
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
                            title: t.t.title ?? "",
                            artists: t.t.authors.map(a => a.name),
                        };
                    case "StRelated": {
                        return {
                            type: "StRelated",
                            id: t.t.id,
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
                            title: t.t.title,
                            artists: t.t.artists.map(a => a.name),
                        };
                    case "StRelated": {
                        for (let source of t.t.info_sources) {
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
            case "MbzRecording": {
                return mbz.mbz.recording_autoplay(utils.clone(t.t), typ);
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
            case "LocalState":
            case "ArtistBlacklist":
            case "SongBlacklist":
            case "MbzArtist":
                throw new Error("can't play this. so no autoplay.");
            default:
                throw exhausted(t);
        }
    }

    async saved_covau_song(dbops: server.DbOps) {
        let t = this.t.t;
        switch (t.typ) {
            case "Song": {
                return utils.clone(t);
            } break;
            case "MmSong": {
                let song = t.t;

                let vid = await st.cached.video(song.key, dbops);
                let id: covau.PlaySource = { type: "YtId", content: vid.t.id };
                let path: covau.PlaySource[] = song.last_known_path ? [{ type: "File", content: song.last_known_path }] : []
                let s: covau.Song = {
                    title: vid.t.title ?? vid.t.id,
                    artists: db.artists(vid.t.authors),
                    thumbnails: [...db.thumbnails(vid.t.thumbnails), st.url.song_thumbnail(vid.t.id)],
                    play_sources: [...path, id],
                    info_sources: [id],
                };

                let s1: server.AlmostDbItem<yt.Song> = { typ: "StSong", t: vid.t };
                let s2: server.AlmostDbItem<covau.Song> = { typ: "Song", t: s };

                await dbops.insert_or_get(s1);
                let res = await dbops.insert_or_get(s2);
                return res.content;
            } break;
            case "StSong": {
                let vid = utils.clone(t.t);

                let id: covau.PlaySource = { type: "YtId", content: vid.id };
                let s: covau.Song = {
                    title: vid.title ?? vid.id,
                    artists: db.artists(vid.authors),
                    thumbnails: [...db.thumbnails(vid.thumbnails), st.url.song_thumbnail(vid.id)],
                    play_sources: [id],
                    info_sources: [id],
                };
                let s1: server.AlmostDbItem<covau.Song> = { typ: "Song", t: s };

                let res = await dbops.insert_or_get(s1);
                return res.content;
            } break;
            case "MbzRecording": {
                let r = mbz.mbz.recording_almostdbitem(utils.clone(t.t), null);
                let res = await dbops.insert_or_get(r);
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
            case "LocalState":
            case "ArtistBlacklist":
            case "SongBlacklist":
            case "MbzArtist":
                return null;
            default:
                throw exhausted(t);
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
        const save_in_list = async (list: ReturnType<typeof editable_list>, dbitem: types.db.DbItem<unknown>) => {
            if (!item.is_playable()) {
                return false;
            }
            await server.db.txn(async db => {
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
                this.t = await db.update(dbitem);
            });
            return true;
        };

        let t = this.t.t;
        switch (t.typ) {
            case "Playlist": {
                let playlist = utils.clone(t);
                let list = editable_list(playlist.t.songs);
                return await save_in_list(list, playlist);
            } break;
            case "Queue": {
                let queue = utils.clone(t);
                let list = editable_list(queue.t.queue.queue.songs);
                return await save_in_list(list, queue);
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
            case "LocalState":
            case "ArtistBlacklist":
            case "SongBlacklist":
            case "MbzArtist":
            case "MbzRecording":
                return false;
            default:
                throw exhausted(t);
        }
    }

    async like(): Promise<boolean> {
        await this.ops().options.like.onclick();
        return true;
    }

    async dislike(): Promise<boolean> {
        await this.ops().options.dislike.onclick();
        return true;
    }

    protected ops() {
        return {
            options: {
                like: {
                    icon: icons.thumbs_up,
                    title: "like",
                    onclick: async () => {
                        await server.db.txn(async db => {
                            let item = utils.clone<DB.DbItem<unknown>>(this.t.t);
                            console.log(item);
                            item.metadata.likes += 1;
                            this.t = await db.update_metadata(item);
                        });
                        toast(`"${this.title()}" liked`, "info");
                    },
                },
                dislike: {
                    icon: icons.thumbs_down,
                    title: "dislike",
                    onclick: async () => {
                        await server.db.txn(async db => {
                            let item = utils.clone<DB.DbItem<unknown>>(this.t.t);
                            item.metadata.dislikes += 1;
                            this.t = await db.update_metadata(item);
                        });
                        toast(`"${this.title()}" disliked`, "info");
                    },
                },
                unlike: {
                    icon: icons.thumbs_up,
                    title: "un-like",
                    onclick: async () => {
                        await server.db.txn(async db => {
                            let item = utils.clone<DB.DbItem<unknown>>(this.t.t);
                            item.metadata.likes -= 1;
                            this.t = await db.update_metadata(item);
                        });
                        toast(`"${this.title()}" un-unliked`, "info");
                    },
                },
                undislike: {
                    icon: icons.thumbs_down,
                    title: "un-dislike",
                    onclick: async () => {
                        await server.db.txn(async db => {
                            let item = utils.clone<DB.DbItem<unknown>>(this.t.t);
                            item.metadata.dislikes -= 1;
                            this.t = await db.update_metadata(item);
                        });
                        toast(`"${this.title()}" un-disliked`, "info");
                    },
                },
            },
            get_artist_searcher_from_keys: (keys: string[]) => {
                return AsyncStaticSearcher(async () => {
                    return await Promise.all(keys
                        .map(k => {
                            return st
                                .cached.artist(k)
                                .then(a => st.parse.wrap_item(a.t, "Artist"))
                                .catch(err => {
                                    let item = new CustomListItem(k, k, "Custom", utils.err_msg(err));
                                    return item;
                                });
                        }));
                });
            },
        };
    }

    impl_options(ctx: RenderContext): ItemOptions {
        let common_options = this.common_options();
        let ops = this.ops();

        let t = this.t;
        switch (t.t.typ) {
            case "MmSong": {
                let s = this.rc<typeof t.t>();
                let options = {
                    copy_url: {
                        icon: icons.copy,
                        title: "copy url",
                        onclick: async () => {
                            let url = st.url.video(s.t.t.key);
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
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
                                common_options.set_as_seed,
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
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
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
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
                                options.copy_url,
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
                                common_options.set_as_seed,
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
                let s = t.t;
                let options = st.options.get_song_ops(utils.clone(s.t));

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
                                ...common_options.open_album(s.t.album),
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
                                common_options.set_as_seed,
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
                                ...common_options.open_album(s.t.album),
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
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
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
                                options.copy_url,
                                ...common_options.open_album(s.t.album),
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
                                common_options.set_as_seed,
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
            case "MbzRecording": {
                let rec = t.t;
                let options = mbz.mbz.recording_ops(utils.clone(rec.t), this);

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
                                options.search_song,
                                options.search_video,
                                options.mbz_url,
                                options.lbz_url,
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
                                common_options.set_as_seed,
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
                                options.search_song,
                                options.search_video,
                                options.mbz_url,
                                options.lbz_url,
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
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
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
                                options.search_song,
                                options.search_video,
                                options.mbz_url,
                                options.lbz_url,
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
                                common_options.set_as_seed,
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
                let s = t.t;
                let song = this.rc<typeof t.t>();
                let options = {
                    copy_url: {
                        icon: icons.copy,
                        title: "copy source url",
                        onclick: async () => {
                            for (let source of s.t.play_sources) {
                                switch (source.type) {
                                    case "File": {
                                        continue;
                                    } break;
                                    case "YtId": {
                                        let url = st.url.video(source.content);
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
                    save_song: () => {
                        let yt_id = s.t.play_sources
                            .filter(id => id.type == "YtId")
                            .map(id => id.content as string).at(0) ?? null;

                        if (yt_id && (s.t.play_sources.find(id => id.type == "File") ?? null) == null) {
                            let id = yt_id;
                            return [{
                                icon: icons.floppy_disk,
                                title: "save song",
                                onclick: async () => {
                                    let s = utils.clone(song.t);
                                    if ((s.t.play_sources.find(id => id.type == "File") ?? null) != null) {
                                        toast("song is already saved", "error");
                                        return;
                                    }
                                    let path = await server.api.save_song(id);
                                    s.t.play_sources = [{ type: "File", content: path }, ...s.t.play_sources];

                                    this.t = await server.db.txn(async db => {
                                        return await db.update(s);
                                    }) as MusicListItem;
                                    toast("song saved");
                                },
                            }];
                        } else {
                            return [];
                        }
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
                                ...options.save_song(),
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
                                common_options.set_as_seed,
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
                                ...options.save_song(),
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
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
                                ops.options.like,
                                ops.options.dislike,
                                ops.options.unlike,
                                ops.options.undislike,
                                options.copy_url,
                                ...options.save_song(),
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
                                common_options.set_as_seed,
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
                let a = this.rc<typeof t.t>();
                let options = {
                    open: {
                        icon: icons.open_new_tab,
                        title: "open",
                        onclick: async () => {
                            let s = Db.new({
                                query_type: "refids",
                                type: "MmSong",
                                ids: utils.clone(a.t.t.songs),
                            }, 30);
                            stores.new_tab(s, a.t.t.name);
                        },
                    },
                    add_all_to_queue: {
                        icon: icons.add,
                        title: "add all to queue",
                        onclick: async () => {
                            let s = Db.new({
                                query_type: "refids",
                                type: "MmSong",
                                ids: utils.clone(a.t.t.songs),
                            }, a.t.t.songs.length);
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
                let a = this.rc<typeof t.t>();
                let options = {
                    open_saved: {
                        icon: icons.open_new_tab,
                        title: "open saved",
                        onclick: async () => {
                            let s = Db.new({
                                query_type: "refids",
                                type: "MmSong",
                                ids: utils.clone(a.t.t.songs),
                            }, 30);
                            stores.new_tab(s, a.t.t.name + " saved");
                        },
                    },
                    open_unexplored: {
                        icon: icons.open_new_tab,
                        title: "open unexplored",
                        onclick: async () => {
                            let s = Db.new({
                                query_type: "refids",
                                type: "MmSong",
                                ids: utils.clone(a.t.t.unexplored_songs) ?? [],
                            }, 30);
                            stores.new_tab(s, a.t.t.name + " unexplored");
                        },
                    },
                    add_saved_to_queue: {
                        icon: icons.add,
                        title: "add all saved to queue",
                        onclick: async () => {
                            let songs = utils.clone(a.t.t.songs);
                            let s = Db.new({
                                query_type: "refids",
                                type: "MmSong",
                                ids: songs,
                            }, songs.length);
                            let items = await s.next_page();
                            await stores.queue_ops.add_item(...items);
                        },
                    },
                    add_all_unexplored_to_queue: {
                        icon: icons.add,
                        title: "add all unexplored to queue",
                        onclick: async () => {
                            let songs = utils.clone(a.t.t.unexplored_songs) ?? [];
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
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
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
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
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
            case "MbzArtist": {
                let a = t.t;
                let options = mbz.mbz.artist_ops(utils.clone(a.t));

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                                common_options.open_details,
                            ],
                            menu: [
                                options.explore_release_groups,
                                options.explore_releases,
                                options.explore_recordings,
                                options.mbz_url,
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
                                common_options.open_details,
                            ],
                        };
                    case "DetailSection":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                options.explore_release_groups,
                                options.explore_releases,
                                options.explore_recordings,
                                options.mbz_url,
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
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
                let list = this.rc<typeof t.t>();
                let options = {
                    open: {
                        icon: icons.open_new_tab,
                        title: "open",
                        onclick: async () => {
                            let ids = utils.clone(list.t.t.data_list);
                            let s = Db.new({
                                query_type: "refids",
                                type: "MmSong",
                                ids,
                            }, 30);
                            stores.new_tab(s, list.t.t.name);
                        },
                    },
                    add_all_to_queue: {
                        icon: icons.add,
                        title: "add all to queue",
                        onclick: async () => {
                            let ids = utils.clone(list.t.t.data_list);
                            let s = Db.new({
                                query_type: "refids",
                                type: "MmSong",
                                ids,
                            }, ids.length);
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
                let queue = this.rc<typeof t.t>();
                let options = {
                    open: {
                        icon: icons.open_new_tab,
                        title: "open",
                        onclick: async () => {
                            let songs = utils.clone(queue.t.t.queue.queue.songs);
                            let s = Db.new({
                                query_type: "ids",
                                type: "Song",
                                ids: songs,
                            }, 30, null, this);
                            stores.new_tab(s, queue.t.t.queue.queue.title);
                        },
                    },
                    add_all_to_queue: {
                        icon: icons.add,
                        title: "add all to queue",
                        onclick: async () => {
                            let songs = utils.clone(queue.t.t.queue.queue.songs);
                            let s = Db.new({
                                query_type: "ids",
                                type: "Song",
                                ids: songs,
                            }, songs.length);
                            let items = await s.next_page();
                            await stores.queue_ops.add_item(...items);
                        },
                    },
                    rename: {
                        icon: icons.floppy_disk,
                        title: "rename",
                        onclick: async () => {
                            let _name = await prompter.prompt("Enter queue name");
                            if (!_name) {
                                return;
                            }
                            let name = _name;

                            let q = utils.clone(queue.t);
                            q.t.queue.queue.title = name;

                            this.t = await server.db.txn(async db => {
                                return await db.update(q);
                            });

                            toast("queue renamed");
                        },
                    },
                    continue: {
                        icon: icons.play,
                        title: "continue queue",
                        onclick: async () => {
                            let pl = get(stores.player);
                            pl.pause();
                            stores.player.update(t => t);

                            await stores.syncops.set.queue(utils.clone(queue.t));
                        },
                    },
                    save_as_playlist: {
                        icon: icons.floppy_disk,
                        title: "save as playlist",
                        onclick: async () => {
                            let name = await prompter.prompt("Enter name");
                            if (name == null) {
                                return;
                            }

                            let pl: types.covau.Playlist = {
                                title: name,
                                songs: utils.clone(queue.t.t.queue.queue.songs),
                            };

                            await server.db.txn(async db => {
                                return await db.insert({ typ: "Playlist", t: pl });
                            });

                            toast(`playlist '${name}' saved`);
                        },
                    },
                };

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            icon_top: options.continue,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                            ],
                            menu: [
                                options.open,
                                options.save_as_playlist,
                                options.add_all_to_queue,
                                options.rename,
                                common_options.open_details,
                            ],
                        };
                    case "DetailSection":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                options.continue,
                                options.open,
                                options.save_as_playlist,
                                options.add_all_to_queue,
                                options.rename,
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
                let playlist = this.rc<typeof t.t>();
                let options = {
                    open: {
                        icon: icons.open_new_tab,
                        title: "open",
                        onclick: async () => {
                            let s = Db.new({
                                query_type: "ids",
                                type: "Song",
                                ids: utils.clone(playlist.t.t.songs),
                            }, 30, null, this);
                            stores.new_tab(s, playlist.t.t.title);
                        },
                    },
                    play: {
                        icon: icons.play,
                        title: "play",
                        onclick: async () => {
                            let q: types.covau.Queue = {
                                queue: {
                                    current_index: null,
                                    queue: {
                                        title: `Playlist '${playlist.t.t.title}'`,
                                        songs: [...playlist.t.t.songs],
                                    },
                                },
                                blacklist: null,
                                seed: null,
                                seen: null,
                            };
                            let queue = await server.db.txn(async db => {
                                return await db.insert({ typ: "Queue", t: q });
                            });

                            await stores.syncops.set.queue(queue);
                            await stores.queue_ops.play_next();

                            toast(`playing ${playlist.t.t.title}`);
                        },
                    },
                    add_all_to_queue: {
                        icon: icons.add,
                        title: "add all to queue",
                        onclick: async () => {
                            let songs = utils.clone(playlist.t.t.songs);
                            let s = Db.new({
                                query_type: "ids",
                                type: "Song",
                                ids: songs,
                            }, songs.length);
                            let items = await s.next_page();
                            await stores.queue_ops.add_item(...items);
                        },
                    },
                    rename: {
                        icon: icons.floppy_disk,
                        title: "rename",
                        onclick: async () => {
                            let _name = await prompter.prompt("Enter playlist name");
                            if (!_name) {
                                return;
                            }

                            let pl = utils.clone(playlist.t);
                            let name = _name;
                            pl.t.title = name;

                            this.t = await server.db.txn(async db => {
                                return await db.update(pl);
                            });

                            toast("playlist renamed");
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
                                options.play,
                                options.add_all_to_queue,
                                options.rename,
                                common_options.open_details,
                            ],
                        };
                    case "DetailSection":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                options.open,
                                options.play,
                                options.add_all_to_queue,
                                options.rename,
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
                let u = this.rc<typeof t.t>();
                switch (u.t.t.source.type) {
                    case "MusimanagerSearch": {
                        let options = {
                            open_songs: {
                                icon: icons.open_new_tab,
                                title: "open songs",
                                onclick: async () => {
                                    let ss = u.t.t.source;
                                    if (ss.type != "MusimanagerSearch") {
                                        throw new Error();
                                    }

                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: ss.content.songs.queue.map(s => s.item),
                                    }, 50);
                                    stores.new_tab(s, u.t.t.title);
                                },
                            },
                            open_known_albums: {
                                icon: icons.open_new_tab,
                                title: "open known albums",
                                onclick: async () => {
                                    let ss = u.t.t.source;
                                    if (ss.type != "MusimanagerSearch") {
                                        throw new Error();
                                    }

                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmAlbum",
                                        ids: ss.content.known_albums.map(a => a.item),
                                    }, 50);
                                    stores.new_tab(s, `${u.t.t.title} Albums`);
                                },
                            },
                            add_all_to_queue: {
                                icon: icons.add,
                                title: "add all to queue",
                                onclick: async () => {
                                    let ss = u.t.t.source;
                                    if (ss.type != "MusimanagerSearch") {
                                        throw new Error();
                                    }

                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "MmSong",
                                        ids: ss.content.songs.queue.map(s => s.item),
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
                                    let ss = u.t.t.source;
                                    if (ss.type != "MusimanagerSearch") {
                                        throw new Error();
                                    }

                                    let s = ops.get_artist_searcher_from_keys(ss.content.artist_keys.filter(k => k.length > 0));
                                    stores.new_tab(s, `${u.t.t.title} Sources`);
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
                        let options = {
                            open_songs: {
                                icon: icons.open_new_tab,
                                title: "open songs",
                                onclick: async () => {
                                    let ss = u.t.t.source;
                                    if (ss.type != "SongTubeSearch") {
                                        throw new Error();
                                    }

                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "StSong",
                                        ids: ss.content.songs.queue.map(s => s.item),
                                    }, 50);
                                    stores.new_tab(s, u.t.t.title);
                                },
                            },
                            open_known_albums: {
                                icon: icons.open_new_tab,
                                title: "open known albums",
                                onclick: async () => {
                                    let ss = u.t.t.source;
                                    if (ss.type != "SongTubeSearch") {
                                        throw new Error();
                                    }

                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "StAlbum",
                                        ids: ss.content.known_albums.map(a => a.item),
                                    }, 50);
                                    stores.new_tab(s, `${u.t.t.title} Albums`);
                                },
                            },
                            add_all_to_queue: {
                                icon: icons.add,
                                title: "add all to queue",
                                onclick: async () => {
                                    let ss = u.t.t.source;
                                    if (ss.type != "SongTubeSearch") {
                                        throw new Error();
                                    }

                                    let s = Db.new({
                                        query_type: "refids",
                                        type: "StSong",
                                        ids: ss.content.songs.queue.map(s => s.item),
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
                        throw exhausted(u.t.t.source);
                }
            } break;
            case "StAlbum": {
                let options = st.options.get_album_ops(utils.clone(t.t.t));

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
                let options = st.options.get_playlist_ops(utils.clone(t.t.t));

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
                let options = st.options.get_artist_ops(utils.clone(t.t.t));

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                                common_options.open_details,
                            ],
                            menu: [
                                ...options.explore_songs(),
                                ...options.explore_releases(),
                                options.copy_channel_url,
                                options.copy_artist_url,
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
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
                                common_options.blacklist_artist,
                                common_options.unblacklist_artist,
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
            case "SongBlacklist": {
                let bl = this.rc<typeof t.t>();
                let options = {
                    open_songs: {
                        icon: icons.open_new_tab,
                        title: "open songs",
                        onclick: async () => {
                            let s = Db.new({
                                query_type: "refids",
                                type: "Song",
                                ids: bl.t.t.songs.map(s => s.content),
                            }, 10);
                            stores.new_tab(s, bl.t.t.title ?? "song blacklist");
                        },
                    },
                    load: {
                        icon: icons.repeat,
                        title: "load",
                        onclick: async () => {
                            let sync = get(stores.syncer);
                            if (sync.queue.t.seen == bl.t.id) {
                                toast("song blacklist already loaded");
                            } else {
                                stores.syncops.set.seen(utils.clone(bl.t));
                                toast("song blacklist set");
                            }
                        },
                    },
                    rename: {
                        icon: icons.floppy_disk,
                        title: "rename",
                        onclick: async () => {
                            let _name = await prompter.prompt("Enter name");
                            if (!_name) {
                                return;
                            }
                            let name = _name;

                            let b = utils.clone(bl.t);
                            b.t.title = name;

                            this.t = await server.db.txn(async db => {
                                return await db.update(b);
                            });

                            toast("song blacklist renamed");
                        },
                    },
                };

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            top_right: options.open_songs,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                                common_options.open_details,
                            ],
                            menu: [
                                options.open_songs,
                                options.load,
                                options.rename,
                                common_options.open_details,
                            ],
                        };
                    case "DetailSection":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                options.open_songs,
                                options.load,
                                options.rename,
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
            case "ArtistBlacklist": {
                let bl = this.rc<typeof t.t>();
                let options = {
                    explore: {
                        icon: icons.open_new_tab,
                        title: "explore",
                        onclick: async () => {
                            let s = AsyncStaticSearcher(async () => {
                                let artists = await Promise.all(bl.t.t.artists.map(async id => {
                                    if (id.type == "YtId") {
                                        let a = await st.cached.artist(id.content);
                                        return db.wrapped(a);
                                    } else {
                                        let a = await mbz.mbz.cached.artist(id.content);
                                        return db.wrapped(a);
                                    }
                                }));
                                return artists;
                            });
                            stores.new_tab(s, bl.t.t.title ?? "song blacklist");
                        },
                    },
                    load: {
                        icon: icons.repeat,
                        title: "load",
                        onclick: async () => {
                            let sync = get(stores.syncer);
                            if (sync.queue.t.blacklist == bl.t.id) {
                                toast("blacklist already loaded");
                            } else {
                                stores.syncops.set.blacklist(utils.clone(bl.t));
                                toast("song blacklist set");
                            }
                        },
                    },
                    rename: {
                        icon: icons.floppy_disk,
                        title: "rename",
                        onclick: async () => {
                            let _name = await prompter.prompt("Enter name");
                            if (!_name) {
                                return;
                            }
                            let name = _name;

                            let b = utils.clone(bl.t);
                            b.t.title = name;

                            this.t = await server.db.txn(async db => {
                                return await db.update(b);
                            });

                            toast("blacklist renamed");
                        },
                    },
                };

                switch (ctx) {
                    case "Browser":
                        return {
                            ...common_options.empty_ops,
                            top_right: options.explore,
                            bottom: [
                                ops.options.like,
                                ops.options.dislike,
                                common_options.open_details,
                            ],
                            menu: [
                                options.explore,
                                options.load,
                                options.rename,
                                common_options.open_details,
                            ],
                        };
                    case "DetailSection":
                        return {
                            ...common_options.empty_ops,
                            menu: [
                                options.explore,
                                options.load,
                                options.rename,
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
            case "LocalState":
                return common_options.empty_ops;
            default:
                throw exhausted(t.t)
        }
    }

    sections(): DetailSection[] {
        let sections = this.common_sections(this.t.t);
        let maybe = sections.ops.maybe;
        let ops = this.ops();
        let common_options = this.common_options();

        let t = this.t;
        switch (t.t.typ) {
            case "Song": {
                let song = this.rc<typeof t.t>();
                let playsource = mixins.RearrangeWrapper(utils.clone(song.t.t.play_sources), s => {
                    let ops = {
                        remove: (item: ListItem) => ({
                            icon: icons.remove,
                            title: "remove",
                            onclick: async () => {
                                let s = await playsource.remove_item(item);
                                // TODO: delete file if source if file
                            },
                        }),
                        play: {
                            icon: icons.play,
                            title: "detour",
                            onclick: async () => {
                                let item = new CustomListItem(this.get_key() as string, this.title(), this.typ(), this.title_sub());
                                item._thumbnail = this.thumbnail();
                                item._is_playable = true;
                                if (s.type == "YtId") {
                                    item._yt_id = s.content;
                                    item._drag_url = st.url.video(s.content);
                                    item._audio_uri = async () => {
                                        let uri = await st.fetch.uri(s.content);
                                        if (uri) {
                                            return uri.uri;
                                        } else {
                                            return null;
                                        }
                                    };
                                } else {
                                    item._source_path = s.content;
                                    item._audio_uri = async () => {
                                        return "file://" + await server.api.to_path(s.content);
                                    };
                                }
                                stores.queue_ops.detour(item);
                            },
                        },
                    };

                    if (s.type == "YtId") {
                        let id = `${s.type} ${s.content}`;
                        let yt = new CustomListItem(id, s.type, "Custom", s.content);
                        yt._drag_url = st.url.video(s.content);
                        yt._options = {
                            ...common_options.empty_ops,
                            icon_top: ops.play,
                            top_right: ops.remove(yt),
                            bottom: [
                                {
                                    icon: icons.open_new_tab,
                                    title: "open",
                                    onclick: async () => {
                                        let vid = await st.cached.video(s.content);
                                        let item = db.wrapped(vid);
                                        let ops = item.common_options();
                                        await ops.open_details.onclick();
                                    },
                                },
                            ],
                            menu: [
                                {
                                    icon: icons.floppy_disk,
                                    title: "save source",
                                    onclick: async () => {
                                        let t = utils.clone(song.t);
                                        if ((t.t.play_sources.find(id => id.type == "File" && id.content.path.includes(s.content)) ?? null) != null) {
                                            toast("song is already saved", "error");
                                            return;
                                        }
                                        let path = await server.api.save_song(s.content);
                                        t.t.play_sources = [{ type: "File", content: path }, ...t.t.play_sources];

                                        this.t = await server.db.txn(async db => {
                                            return await db.update(t);
                                        }) as MusicListItem;
                                        toast("source saved");
                                    },
                                },
                            ],
                        };
                        return yt;
                    } else {
                        let id = `${s.type} ${s.content.typ} ${s.content.path}`;
                        let file = new CustomListItem(id, s.type, "Custom", `${s.content.typ} ${s.content.path}`);
                        file._options = {
                            ...common_options.empty_ops,
                            icon_top: ops.play,
                            top_right: ops.remove(file),
                        };
                        return file;
                    }
                }, async items => {
                    let t = utils.clone(song.t);
                    t.t.play_sources = items;
                    await server.db.txn(async dbops => {
                        this.t = await dbops.update(t);
                    });
                });

                let infosource = mixins.RearrangeWrapper(utils.clone(song.t.t.info_sources), s => {
                    let ops = {
                        remove: (item: ListItem) => ({
                            icon: icons.remove,
                            title: "remove",
                            onclick: async () => {
                                let s = await playsource.remove_item(item);
                                // TODO: delete file if source if file
                            },
                        }),
                    };

                    let id = `${s.type} ${s.content}`;
                    let item = new CustomListItem(id, s.type, "Custom", s.content);
                    if (s.type == "YtId") {
                        item._drag_url = st.url.video(s.content);
                    } else {
                        item._drag_url = mbz.mbz.urls.recording.mbz(s.content);
                    }
                    item._options = {
                        ...common_options.empty_ops,
                        top_right: ops.remove(item),
                        bottom: [
                            {
                                icon: icons.open_new_tab,
                                title: "open",
                                onclick: async () => {
                                    let vid = await st.cached.video(s.content);
                                    let item = db.wrapped(vid);
                                    let ops = item.common_options();
                                    await ops.open_details.onclick();
                                },
                            },
                        ],
                    };
                    return item;
                }, async items => {
                    let t = utils.clone(song.t);
                    t.t.info_sources = items;
                    await server.db.txn(async dbops => {
                        this.t = await dbops.update(t);
                    });
                });

                let thumbs = mixins.RearrangeWrapper(utils.clone(song.t.t.thumbnails), (s, i) => {
                    let id = i.toString();
                    let item = new CustomListItem(id, s.url, "Custom", s.size ? `${s.size.width}x${s.size.height}` : null);
                    item._thumbnail = s.url;
                    item._drag_url = s.url;
                    return item;
                }, async items => {
                    let t = utils.clone(song.t);
                    t.t.thumbnails = items;
                    await server.db.txn(async dbops => {
                        this.t = await dbops.update(t);
                    });
                });

                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.t.t.typ,
                            },
                            {
                                heading: "Title",
                                content: song.t.t.title,
                            },
                            ...song.t.t.artists.map(a => ({
                                heading: "Artist",
                                content: a.name,
                            })),
                        ],
                    },
                    {
                        type: "Rearrange",
                        title: "Info Sources",
                        height: Math.min(5, infosource.items.length),
                        searcher: writable(infosource),
                    },
                    {
                        type: "Rearrange",
                        title: "Play Sources",
                        height: Math.min(3, playsource.items.length),
                        searcher: writable(playsource),
                    },
                    {
                        type: "Searcher",
                        title: "Artists",
                        height: Math.min(5, song.t.t.artists.length),
                        searcher: writable(AsyncStaticSearcher(async () => {
                            let artists = await Promise.all(song.t.t.artists.map(async (t, i) => {
                                if (t.source?.type == "YtId") {
                                    let a = await st.cached.artist(t.source.content);
                                    return db.wrapped(a);
                                } else if (t.source?.type == "MbzId") {
                                    let a = await mbz.mbz.cached.artist(t.source.content);
                                    return db.wrapped(a);
                                } else {
                                    return new CustomListItem(t.name + i.toString(), t.name, "Custom");
                                }
                            }));
                            return artists;
                        })
                        ),
                    },
                    {
                        type: "Rearrange",
                        title: "Thumbnails",
                        height: Math.min(3, thumbs.items.length),
                        searcher: writable(thumbs),
                    },
                    sections.options,
                    sections.json,
                ] as DetailSection[];
            } break;
            case "MmSong": {
                let song = this.rc<typeof t.t>();
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.t.t.typ,
                            },
                            {
                                heading: "Title",
                                content: this.title(),
                            },
                            {
                                heading: "Artist",
                                content: song.t.t.artist_name,
                            },
                            {
                                heading: "Key",
                                content: song.t.t.key,
                            },
                            ...maybe(song.t.t.last_known_path, p => ({
                                heading: "File",
                                content: `${p.typ} ${p.path}`,
                            })),
                        ]
                    },
                    sections.options,
                    sections.json,
                ] as DetailSection[];
            } break;
            case "StSong": {
                let song = this.rc<typeof t.t>();
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.t.t.typ,
                            },
                            {
                                heading: "Title",
                                content: this.title(),
                            },
                            {
                                heading: "Key",
                                content: song.t.id,
                            },
                            ...maybe(song.t.t.album?.name ?? null, n => ({
                                heading: "Album",
                                content: n,
                            })),
                            ...song.t.t.authors.map(a => ({
                                heading: "Artist",
                                content: a.name,
                            })),
                        ]
                    },
                    sections.options,
                    sections.json,
                ] as DetailSection[];
            } break;
            case "MbzRecording": {
                let song = this.rc<typeof t.t>();
                return [
                    mbz.mbz.recording_info_section(utils.clone(song.t.t)),
                    sections.options,
                    sections.json,
                ] as DetailSection[];
            } break;
            case "ArtistBlacklist": {
                let bl = this.t;
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
                                content: this.title(),
                            }
                        ],
                    },
                    sections.options,
                    sections.json,
                ] as DetailSection[];
            } break;
            case "SongBlacklist": {
                let bl = this.rc<typeof t.t>();
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
                                content: this.title(),
                            }
                        ],
                    },
                    sections.options,
                    {
                        type: "Searcher",
                        title: "Songs",
                        options: [],
                        height: Math.min(5, bl.t.t.songs.length),
                        searcher: writable(Db.new({
                            query_type: "refids",
                            type: "Song",
                            ids: bl.t.t.songs.map(s => s.content),
                        }, 10)),
                    },
                    sections.json,
                ] as DetailSection[];
            } break;
            case "MbzArtist": {
                let a = this.rc<typeof t.t>();
                return [
                    mbz.mbz.artist_info_section(utils.clone(a.t.t), this),
                    sections.options,
                    sections.json,
                ] as DetailSection[];
            } break;
            case "Playlist": {
                let playlist = this.rc<typeof t.t>();
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.t.t.typ,
                            },
                            {
                                heading: "Title",
                                content: playlist.t.t.title,
                            },
                        ]
                    },
                    sections.options,
                    {
                        type: "Searcher",
                        title: "Songs",
                        options: [],
                        height: Math.min(5, playlist.t.t.songs.length),
                        searcher: writable(Db.new({
                            query_type: "ids",
                            type: "Song",
                            ids: utils.clone(playlist.t.t.songs),
                        }, 10)),
                    },
                    sections.json,
                ] as DetailSection[];
            } break;
            case "Queue": {
                let queue = this.rc<typeof t.t>();
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.t.t.typ,
                            },
                            {
                                heading: "Title",
                                content: queue.t.t.queue.queue.title,
                            },
                        ]
                    },
                    sections.options,
                    {
                        type: "Searcher",
                        title: "Songs",
                        options: [],
                        height: Math.min(5, queue.t.t.queue.queue.songs.length),
                        searcher: writable(Db.new({
                            query_type: "ids",
                            type: "Song",
                            ids: utils.clone(queue.t.t.queue.queue.songs),
                        }, 10)),
                    },
                    ...maybe(queue.t.t.seen, seen => ({
                        type: "Searcher",
                        title: "Song Blacklist",
                        options: [],
                        height: 1,
                        searcher: writable(AsyncStaticSearcher(async () => {
                            let bl = await server.db.get_by_id("SongBlacklist", seen);
                            if (bl == null) {
                                throw new Error("song blacklist does not exist");
                            }
                            let item = db.wrapped(bl);
                            return [item];
                        })),
                    })),
                    ...maybe(queue.t.t.blacklist, blacklist => ({
                        type: "Searcher",
                        title: "Blacklist",
                        options: [],
                        height: 1,
                        searcher: writable(AsyncStaticSearcher(async () => {
                            let bl = await server.db.get_by_id("ArtistBlacklist", blacklist);
                            if (bl == null) {
                                throw new Error("blacklist does not exist");
                            }
                            let item = db.wrapped(bl);
                            return [item];
                        })),
                    })),
                    ...maybe(queue.t.t.seed, seed => ({
                        type: "Searcher",
                        title: "Autoplay Seed",
                        options: [],
                        height: 1,
                        searcher: writable(AsyncStaticSearcher(async () => {
                            let song = await server.db.get_by_id("Song", seed);
                            if (song == null) {
                                throw new Error("seed does not exist");
                            }
                            let item = db.wrapped(song);
                            return [item];
                        })),
                    })),
                    sections.json,
                ] as DetailSection[];
            } break;
            case "MmAlbum": {
                let album = this.rc<typeof t.t>();
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.t.t.typ,
                            },
                            {
                                heading: "Title",
                                content: this.title(),
                            },
                            {
                                heading: "Artist",
                                content: album.t.t.artist_name,
                            },
                            {
                                heading: "Album Id",
                                content: album.t.t.browse_id,
                            },
                        ]
                    },
                    sections.options,
                    {
                        type: "Searcher",
                        title: "Songs",
                        options: [],
                        height: Math.min(5, album.t.t.songs.length),
                        searcher: writable(Db.new({
                            query_type: "refids",
                            type: "MmSong",
                            ids: utils.clone(album.t.t.songs),
                        }, 10)),
                    },
                    sections.json,
                ] as DetailSection[];
            } break;
            case "MmArtist": {
                let artist = this.rc<typeof t.t>();
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.t.t.typ,
                            },
                            {
                                heading: "Name",
                                content: artist.t.t.name,
                            },
                            ...artist.t.t.keys.map(k => ({
                                heading: "Key",
                                content: k,
                            })),
                            ...artist.t.t.search_keywords.map(k => ({
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
                        height: Math.min(5, artist.t.t.songs.length),
                        searcher: writable(Db.new({
                            query_type: "refids",
                            type: "MmSong",
                            ids: utils.clone(artist.t.t.songs),
                        }, 10)),
                    },
                    ...maybe(utils.clone(artist.t.t.unexplored_songs) ?? null, songs => ({
                        type: "Searcher",
                        title: "Unexplored Songs",
                        options: [],
                        height: Math.min(5, songs.length),
                        searcher: writable(Db.new({
                            query_type: "refids",
                            type: "MmSong",
                            ids: songs,
                        }, 10)),
                    })),
                    sections.json,
                ] as DetailSection[];
            } break;
            case "MmPlaylist": {
                let playlist = this.rc<typeof t.t>();
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.t.t.typ,
                            },
                            {
                                heading: "Name",
                                content: playlist.t.t.name,
                            },
                        ]
                    },
                    sections.options,
                    {
                        type: "Searcher",
                        title: "Songs",
                        options: [],
                        height: Math.min(5, playlist.t.t.data_list.length),
                        searcher: writable(Db.new({
                            query_type: "refids",
                            type: "MmSong",
                            ids: utils.clone(playlist.t.t.data_list),
                        }, 10)),
                    },
                    sections.json,
                ] as DetailSection[];
            } break;
            case "MmQueue": {
                let queue = this.rc<typeof t.t>();
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.t.t.typ,
                            },
                            {
                                heading: "Name",
                                content: queue.t.t.name,
                            },
                        ]
                    },
                    sections.options,
                    {
                        type: "Searcher",
                        title: "Songs",
                        options: [],
                        height: Math.min(5, queue.t.t.data_list.length),
                        searcher: writable(Db.new({
                            query_type: "refids",
                            type: "MmSong",
                            ids: utils.clone(queue.t.t.data_list),
                        }, 10)),
                    },
                    sections.json,
                ] as DetailSection[];
            } break;
            case "StAlbum": {
                let album = this.rc<typeof t.t>();
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.t.t.typ,
                            },
                            {
                                heading: "Name",
                                content: album.t.t.title,
                            },
                            {
                                heading: "Album Id",
                                content: album.t.t.id,
                            },
                            ...maybe(album.t.t.author?.name ?? null, a => ({
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
                let playlist = this.rc<typeof t.t>();
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.t.t.typ,
                            },
                            {
                                heading: "Name",
                                content: playlist.t.t.title,
                            },
                            {
                                heading: "Playlist Id",
                                content: playlist.t.t.id,
                            },
                            ...maybe(playlist.t.t.author?.name ?? null, a => ({
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
                let artist = this.rc<typeof t.t>();
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.t.t.typ,
                            },
                            {
                                heading: "Name",
                                content: artist.t.t.name,
                            },
                            {
                                heading: "Artist Id",
                                content: artist.t.t.id,
                            },
                            ...maybe(artist.t.t.subscribers, a => ({
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
                let updater = this.rc<typeof t.t>();
                let source = updater.t.t.source;
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
                                        content: this.t.t.typ,
                                    },
                                    {
                                        heading: "Name",
                                        content: updater.t.t.title,
                                    },
                                    {
                                        heading: "Enabled",
                                        content: updater.t.t.enabled.toString(),
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
            case "LocalState": {
                return [
                    {
                        type: "Info",
                        info: [
                            {
                                heading: "Type",
                                content: this.t.t.typ,
                            },
                        ]
                    },
                    sections.options,
                    sections.json,
                ] as DetailSection[];
            } break;
            default:
                throw exhausted(t.t);
        }
    }
}

interface IClassTypeWrapper {
    next_page(): Promise<DbListItem[]>;
};
function ClassTypeWrapper<S extends mixins.Constructor<{
    next_page(): Promise<KeyedMusicListItem[]>;
}>>(s: S) {
    return class ClassTypeWrapper extends s implements IClassTypeWrapper {
        // @ts-ignore
        async next_page(): Promise<DbListItem[]> {
            let res = await super.next_page();
            return res.map(m => {
                // delete get_key function so that structuredClone works on this :|
                let t = m as MusicListItem & { get_key: unknown };
                delete t.get_key;
                return t;
            }).map(m => new DbListItem(m));
        }
    } as mixins.Constructor<IClassTypeWrapper> & S; // S has to be after the interface so that it overrides
}

export const db = {
    wrapped_items<T>(items: types.db.DbItem<T>[]): DbListItem[] {
        return items.map(e => new DbListItem(e as MusicListItem))
    },
    wrapped<T>(item: types.db.DbItem<T>): DbListItem {
        return new DbListItem(item as MusicListItem);
    },
    thumbnails<T extends { url: string, width: number, height: number }>(thumbs: T[]) {
        return thumbs.map(t => ({
            url: t.url,
            size: {
                width: t.width,
                height: t.height,
            },
        }) as types.covau.Thumbnail)
    },
    artists(authors: yt.Author[]) {
        return authors.map(a => ({
            name: a.name,
            source: a.channel_id ? { type: "YtId", content: a.channel_id } : null,
        } as types.covau.Artist));
    },
};
export class Db extends mixins.Unpaged<MusicListItem> {
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
        const US = mixins.UniqueSearch<DbListItem, typeof CW>(CW);
        const SS = mixins.SavedSearch<DbListItem, typeof US>(US);
        const AW = mixins.DebounceWrapper<DbListItem, typeof SS>(SS);
        const DW = mixins.DropWrapper<typeof AW>(AW, drop_handle);
        const W = DW;
        if (wrapper) {
            const WR = wrapper(W) as typeof W;
            return new WR(query, page_size);
        } else {
            return new W(query, page_size);
        }
    }

    static unwrapped(query: BrowseQuery, page_size: number) {
        const US = mixins.UniqueSearch<KeyedMusicListItem, typeof Db>(Db);
        const SS = mixins.SavedSearch<MusicListItem, typeof US>(US);
        const AW = mixins.DebounceWrapper<MusicListItem, typeof SS>(SS);
        return new AW(query, page_size);
    }

    static fused() {
        // @ts-ignore
        let s = Db.new({ type: '' }, 1);
        s.has_next_page = false;
        return s;
    }

    async fetch(query: string): Promise<MusicListItem[]> {
        if (this.query.query_type != "search") {
            throw new Error("wrong query type");
        }

        let q: DB.SearchQuery = {
            type: "Query",
            content: {
                query: query,
                page_size: this.page_size,
            },
        };
        let matches: DB.SearchMatches<unknown> = await server.db.search(
            this.query.type,
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
    async next_page(): Promise<KeyedMusicListItem[]> {
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
                let matches: DB.SearchMatches<unknown> = await server.db.search(
                    this.query.type,
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

            return keyed(items) as KeyedMusicListItem[];
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

            let matches: DB.DbItem<unknown>[] = await server.db.get_many_by_refid(
                this.query.type,
                ids,
            );
            return keyed(matches) as KeyedMusicListItem[];
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

            if (this.query.type == null) {
                let matches: DB.DbItem<unknown>[] = await server.db.get_many_untyped_by_id(
                    ids,
                );
                return keyed(matches) as KeyedMusicListItem[];
            } else {
                let matches: DB.DbItem<unknown>[] = await server.db.get_many_by_id(
                    this.query.type,
                    ids,
                );
                return keyed(matches) as KeyedMusicListItem[];
            }
        } else if (this.query.query_type === "dynamic-refids") {
            let ids = this.query.query.slice(
                this.page_end_index,
                Math.min(
                    this.page_end_index + this.page_size,
                    this.query.query.length,
                ),
            );
            this.page_end_index += ids.length;
            if (this.page_end_index >= this.query.query.length) {
                this.has_next_page = false;
            }

            let matches: DB.DbItem<unknown>[] = await Promise.all(ids.map(async id => {
                let item = await server.db.get_by_refid(id.typ, id.refid);
                if (item == null) {
                    throw new Error(`item with type ${id.typ} and refid ${id.refid} not found`);
                }
                return item;
            }));
            return keyed(matches) as KeyedMusicListItem[];
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
