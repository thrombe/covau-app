import { DebounceWrapper, MapWrapper, SavedSearch, UniqueSearch, Unpaged, type Constructor, DropWrapper } from "./mixins.ts";
import * as MBZ from "$types/mbz.ts";
import { exhausted, type Keyed } from "$lib/virtual.ts";
import { ListItem, type Option, type RenderContext } from "./item.ts";
import type { AlmostDbItem, DbOps } from "$lib/local/db.ts";
import * as st from "$lib/searcher/song_tube.ts";
import { get } from "svelte/store";
import * as stores from "$lib/stores.ts";
import { toast } from "$lib/toast/toast.ts";
import { utils as server } from "$lib/server.ts";
import { prompter } from "$lib/prompt/prompt.ts";
import { StaticSearcher, type Searcher, type SearcherConstructorMapper } from "./searcher.ts";
import type { AutoplayQueryInfo, AutoplayTyp } from "$lib/local/queue.ts";
import * as types from "$types/types.ts";
import * as icons from "$lib/icons.ts";

export type ReleaseWithInfo = MBZ.ReleaseWithInfo;
export type ReleaseGroupWithInfo = MBZ.ReleaseGroupWithInfo;
export type Release = MBZ.Release;
export type ReleaseGroup = MBZ.ReleaseGroup;
export type Artist = MBZ.Artist;
export type ArtistWithUrls = MBZ.WithUrlRels<MBZ.Artist>;
export type Recording = MBZ.Recording;
export type RecordingWithInfo = MBZ.RecordingWithInfo;
export type RadioSong = MBZ.RadioSong;

export type MusicListItem = Keyed & { data: Keyed } & (
    | { typ: "MbzReleaseWithInfo", data: ReleaseWithInfo }
    | { typ: "MbzReleaseGroupWithInfo", data: ReleaseGroupWithInfo }
    | { typ: "MbzRelease", data: Release }
    | { typ: "MbzReleaseGroup", data: ReleaseGroup }
    | { typ: "MbzRecordingWithInfo", data: RecordingWithInfo }
    | { typ: "MbzRecording", data: Recording }
    | { typ: "MbzArtist", data: Artist }
    | { typ: "MbzRadioSong", data: RadioSong }
);

export type SearchTyp = "MbzReleaseWithInfo" | "MbzReleaseGroupWithInfo" | "MbzArtist" | "MbzRecordingWithInfo" | "MbzRadioSong";
export type IdFetchTyp = Exclude<SearchTyp, "MbzRadioSong"> | "MbzArtistWithUrls";
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
    yt_song: types.yt.Song | null = null;

    constructor(data: MusicListItem) {
        super();
        this.data = data;
    }

    get_key(): unknown {
        return this.data.get_key();
    }

    typ() {
        return this.data.typ;
    }

    song_ids(): string[] {
        switch (this.data.typ) {
            case "MbzRadioSong":
                return this.data.data.identifier
            case "MbzRecording":
            case "MbzRecordingWithInfo":
                return [this.data.data.id];
            case "MbzReleaseWithInfo":
            case "MbzReleaseGroupWithInfo":
            case "MbzRelease":
            case "MbzReleaseGroup":
            case "MbzArtist":
                return [];
            default:
                throw exhausted(this.data);
        }
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
            case "MbzRadioSong":
                return this.data.data.title;
            default:
                throw exhausted(this.data);
        }
    }
    thumbnail(): string | null {
        switch (this.data.typ) {
            case "MbzRecordingWithInfo":
                return this.data.data.cover_art ?? this.yt_song?.thumbnails.at(0)?.url ?? null;
            case "MbzReleaseWithInfo":
            case "MbzReleaseGroupWithInfo":
                return this.data.data.cover_art;
            case "MbzRelease":
            case "MbzReleaseGroup":
            case "MbzArtist":
            case "MbzRadioSong":
            case "MbzRecording":
                return null;
            default:
                throw exhausted(this.data);
        }
    }
    default_thumbnail(): string {
        return icons.default_music_icon;
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
            case "MbzRadioSong":
                return this.data.data.creator;
            default:
                throw exhausted(this.data);
        }
    }
    protected ops() {
        let self = this;
        let wrapper = MapWrapper(async (item) => {
            if (item.custom_options.length > 0) {
                return item;
            }
            let stitem = item as st.StListItem;
            item.custom_options.push((ctx, old) => {
                if (ctx == "Playbar") {
                    return old;
                }
                old.push({
                    title: "Set as play source",
                    icon: icons.floppy_disk,
                    location: "OnlyMenu",
                    onclick: () => {
                        self.yt_song = stitem.data.content as types.yt.Song;
                        toast("song set as play source for Mbz item");
                    },
                });
                return old;
            });
            return item;
        });
        let new_video_searcher = (q: string) => st.SongTube.new({
            type: "VideoSearch",
            content: {
                query: q,
            },
        }, wrapper);
        let new_song_searcher = (q: string) => st.SongTube.new({
            type: "Search",
            content: {
                search: "YtSong",
                query: q,
            },
        }, wrapper);


        return {
            new_song_searcher,
            new_video_searcher,

            async search_and_get(query: string, type: "song" | "video", switch_tab: boolean = false) {

                let new_searcher: (q: string) => Searcher;
                switch (type) {
                    case "song": {
                        new_searcher = this.new_song_searcher;
                    } break;
                    case "video": {
                        new_searcher = this.new_video_searcher
                    } break;
                    default:
                        throw exhausted(type);
                }

                let searcher = new_searcher(query);
                stores.new_tab(searcher, query, null, query, new_searcher);
                stores.query_input.set(query);
                if (switch_tab) {
                    stores.curr_tab_index.set(get(stores.tabs).length - 1);
                } else {
                    stores.curr_tab_index.set(get(stores.tabs).length - 2);
                }

                let songs = await searcher.next_page();
                let song = songs.at(0) ?? null;
                return song;
            },
            async get_query(recording: RecordingWithInfo) {
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
                    query = await prompter.prompt("Enter a search query");
                }

                return query;
            },
            async play_recording(recording: RecordingWithInfo, type: "song" | "video") {
                if (self.yt_song) {
                    return st.st.get_wrapped([self.yt_song], "Song")[0].audio_uri();
                }

                let query = await this.get_query(recording);

                if (!query) {
                    return null;
                }

                let song = await this.search_and_get(query, type);

                return song?.audio_uri() ?? null;
            },
            async upgrade_to_recording_with_info(rec: Recording) {
                let recording: RecordingWithInfo & Keyed = await mbz.id_fetch(rec.id, "MbzRecordingWithInfo");
                self.data.data = recording;
                self.data.typ = "MbzRecordingWithInfo" as unknown as "MbzRecording"; // what a nice day it is :)
                return recording;
            }
        };
    }
    impl_options(ctx: RenderContext): Option[] {
        let ops = this.ops();
        switch (ctx) {
            case "Queue": {
                switch (this.data.typ) {
                    case "MbzRadioSong": {
                        let song = this.data.data;
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
                                title: "remove from queue",
                                onclick: async () => {
                                    await stores.queue_ops.remove_item(this);
                                },
                            },
                            {
                                icon: icons.floppy_disk,
                                location: "OnlyMenu",
                                title: "search YtSong play source",
                                onclick: async () => {
                                    let query = song.title + " by " + song.creator;
                                    await ops.search_and_get(query, "song", true);
                                },
                            },
                            {
                                icon: icons.floppy_disk,
                                location: "OnlyMenu",
                                title: "search YtVideo play source",
                                onclick: async () => {
                                    let query = song.title + " by " + song.creator;
                                    await ops.search_and_get(query, "video", true);
                                },
                            },
                        ];
                    } break;
                    case "MbzRecording": {
                        let r = this.data.data;
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
                                title: "remove from queue",
                                onclick: async () => {
                                    await stores.queue_ops.remove_item(this);
                                },
                            },
                            {
                                icon: icons.floppy_disk,
                                location: "OnlyMenu",
                                title: "search YtSong play source",
                                onclick: async () => {
                                    let rec = await ops.upgrade_to_recording_with_info(r);
                                    let query = await ops.get_query(rec)
                                    if (query) {
                                        await ops.search_and_get(query, "song", true);
                                    }
                                },
                            },
                            {
                                icon: icons.floppy_disk,
                                location: "OnlyMenu",
                                title: "search YtVideo play source",
                                onclick: async () => {
                                    let rec = await ops.upgrade_to_recording_with_info(r);
                                    let query = await ops.get_query(rec)
                                    if (query) {
                                        await ops.search_and_get(query, "video", true);
                                    }
                                },
                            },
                        ];
                    } break;
                    case "MbzRecordingWithInfo": {
                        let rec = this.data.data;
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
                                title: "remove from queue",
                                onclick: async () => {
                                    await stores.queue_ops.remove_item(this);
                                },
                            },
                            {
                                icon: icons.floppy_disk,
                                location: "OnlyMenu",
                                title: "search YtSong play source",
                                onclick: async () => {
                                    let query = await ops.get_query(rec)
                                    if (query) {
                                        await ops.search_and_get(query, "song", true);
                                    }
                                },
                            },
                            {
                                icon: icons.floppy_disk,
                                location: "OnlyMenu",
                                title: "search YtVideo play source",
                                onclick: async () => {
                                    let query = await ops.get_query(rec)
                                    if (query) {
                                        await ops.search_and_get(query, "video", true);
                                    }
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
                                icon: icons.open_new_tab,
                                location: "TopRight",
                                title: "explore recordings",
                                onclick: async () => {
                                    let s = Mbz.new({
                                        query_type: "linked",
                                        type: "MbzRecording_MbzRelease",
                                        id: a.title,
                                    }, 30);
                                    stores.new_tab(s, "Recordings for " + a.title);
                                },
                            },
                        ];
                    } break;
                    case "MbzReleaseGroupWithInfo": {
                        let a = this.data.data;
                        return [
                            {
                                icon: icons.open_new_tab,
                                location: "TopRight",
                                title: "explore releases",
                                onclick: async () => {
                                    let s = Mbz.new({
                                        query_type: "linked",
                                        type: "MbzRelease_MbzReleaseGroup",
                                        id: a.id,
                                    }, 30);
                                    stores.new_tab(s, "Releases for " + a.title);
                                },
                            },
                            {
                                icon: icons.open_new_tab,
                                location: "OnlyMenu",
                                title: "explore recordings",
                                onclick: async () => {
                                    let releases = await mbz.recordings_from_releases(a.releases);
                                    let s = StaticSearcher(releases);
                                    stores.new_tab(s, "Recordings for " + a.title);
                                },
                            },
                            {
                                icon: icons.add,
                                location: "OnlyMenu",
                                title: "add all to queue",
                                onclick: async () => {
                                    let releases = await mbz.recordings_from_releases(a.releases);
                                    await stores.queue_ops.add_item(...releases);
                                },
                            },
                        ];
                    } break;
                    case "MbzReleaseGroup": {
                        let a = this.data.data;
                        return [
                            {
                                icon: icons.open_new_tab,
                                location: "TopRight",
                                title: "explore releases",
                                onclick: async () => {
                                    let s = Mbz.new({
                                        query_type: "linked",
                                        type: "MbzRelease_MbzReleaseGroup",
                                        id: a.id,
                                    }, 30);
                                    stores.new_tab(s, "Releases for " + a.title);
                                },
                            },
                            {
                                icon: icons.open_new_tab,
                                location: "OnlyMenu",
                                title: "explore recordings",
                                onclick: async () => {
                                    let rel = await ops.upgrade_to_recording_with_info(a);
                                    let releases = await mbz.recordings_from_releases(rel.releases);
                                    let s = StaticSearcher(releases);
                                    stores.new_tab(s, "Recordings for " + a.title);
                                },
                            },
                            {
                                icon: icons.add,
                                location: "OnlyMenu",
                                title: "add all to queue",
                                onclick: async () => {
                                    let rel = await ops.upgrade_to_recording_with_info(a);
                                    let releases = await mbz.recordings_from_releases(rel.releases);
                                    await stores.queue_ops.add_item(...releases);
                                },
                            },
                        ];
                    } break;
                    case "MbzRelease": {
                        let a = this.data.data;
                        return [
                            {
                                icon: icons.open_new_tab,
                                location: "TopRight",
                                title: "explore recordings",
                                onclick: async () => {
                                    let s = Mbz.new({
                                        query_type: "linked",
                                        type: "MbzRecording_MbzRelease",
                                        id: a.id,
                                    }, 30);
                                    stores.new_tab(s, "Recordings for " + a.title);
                                },
                            },
                        ];
                    } break;
                    case "MbzRecordingWithInfo":
                    case "MbzRadioSong":
                    case "MbzRecording": {
                        return [
                            {
                                icon: icons.add,
                                location: "TopRight",
                                title: "add to queue",
                                onclick: async () => {
                                    await stores.queue_ops.add_item(this);
                                },
                            },
                            {
                                icon: icons.play,
                                location: "IconTop",
                                title: "play",
                                onclick: async () => {
                                    await stores.queue_ops.detour(this);
                                },
                            },
                        ];
                    } break;
                    case "MbzArtist": {
                        let a = this.data.data;
                        return [
                            {
                                icon: icons.open_new_tab,
                                location: "OnlyMenu",
                                title: "explore release groups",
                                onclick: async () => {
                                    let s = Mbz.new({
                                        query_type: "linked",
                                        type: "MbzReleaseGroup_MbzArtist",
                                        id: a.id,
                                    }, 30);
                                    stores.new_tab(s, "Release groups for " + a.name);
                                },
                            },
                            {
                                icon: icons.open_new_tab,
                                location: "OnlyMenu",
                                title: "explore releases",
                                onclick: async () => {
                                    let s = Mbz.new({
                                        query_type: "linked",
                                        type: "MbzRelease_MbzArtist",
                                        id: a.id,
                                    }, 30);
                                    stores.new_tab(s, "Releases for " + a.name);
                                },
                            },
                            {
                                icon: icons.open_new_tab,
                                location: "TopRight",
                                title: "explore recordings",
                                onclick: async () => {
                                    let s = Mbz.new({
                                        query_type: "linked",
                                        type: "MbzRecording_MbzArtsit",
                                        id: a.id,
                                    }, 30);
                                    stores.new_tab(s, "Recordings for " + a.name);
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
        let ops = this.ops();
        switch (this.data.typ) {
            case "MbzRecording": {
                let recording = await ops.upgrade_to_recording_with_info(this.data.data);
                return await ops.play_recording(recording, "song");
            } break;
            case "MbzRecordingWithInfo": {
                return await ops.play_recording(this.data.data, "song");
            } break;
            case "MbzRadioSong": {
                let query = this.data.data.title + " by " + this.data.data.creator;
                let song = await ops.search_and_get(query, "song");
                return song?.audio_uri() ?? null;
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

    async autoplay_query(typ: AutoplayTyp): Promise<AutoplayQueryInfo | null> {
        const recording_autoplay = (s: RecordingWithInfo) => {
            switch (typ) {
                case "StSearchRelated":
                    return {
                        type: "StSearchRelated",
                        title: s.title,
                        artists: s.credit.map(a => a.name),
                    };
                case "StRelated":
                    return null;
                case "MbzRadio":
                    return {
                        type: "MbzRadio",
                        title: s.title,
                        artists: s.credit.map(a => a.id),
                    };
                default:
                    throw exhausted(typ);
            }
        };
        let ops = this.ops();

        switch (this.data.typ) {
            case "MbzRecordingWithInfo": {
                let s = this.data.data;
                return recording_autoplay(s) as AutoplayQueryInfo;
            } break;
            case "MbzRecording": {
                let recording = await ops.upgrade_to_recording_with_info(this.data.data);
                return recording_autoplay(recording) as AutoplayQueryInfo;
            } break;
            case "MbzRadioSong": {
                let s = this.data.data;
                switch (typ) {
                    case "MbzRadio":
                    case "StSearchRelated":
                        return {
                            type: "StSearchRelated",
                            title: s.title,
                            artists: [s.creator],
                        };
                    case "StRelated":
                        return null;
                    default:
                        throw exhausted(typ);
                }
            } break;
            case "MbzReleaseWithInfo":
            case "MbzReleaseGroupWithInfo":
            case "MbzArtist":
            case "MbzRelease":
            case "MbzReleaseGroup":
                throw new Error("can't play this. so no autoplay.");
            default:
                throw exhausted(this.data)
        }
    }

    async saved_covau_song(db: DbOps) {
        let ops = this.ops();
        switch (this.data.typ) {
            case "MbzRadioSong": {
                return null;
            } break;
            case "MbzRecording": {
                let _ = await ops.upgrade_to_recording_with_info(this.data.data);
            }; // no break
            case "MbzRecordingWithInfo": {
                let rec = this.data.data as RecordingWithInfo;
                let info_source: types.covau.InfoSource[] = [{ type: "MbzId", content: rec.id }];

                let playsource: types.covau.PlaySource[] = [];
                let thumbnails: string[] = [];
                if (this.yt_song) {
                    playsource.push({
                        type: "YtId",
                        content: this.yt_song.id,
                    })
                    thumbnails = this.yt_song.thumbnails.map(t => t.url);
                }

                let t: types.covau.Song = {
                    title: rec.title,
                    artists: rec.credit.map(a => a.name),
                    thumbnails: thumbnails,
                    play_sources: playsource,
                    info_sources: info_source,
                };
                let s: AlmostDbItem<types.covau.Song> = { typ: "Song", t };

                let res = await db.insert_or_get(s);
                return res.content;
            } break;
            case "MbzReleaseWithInfo":
            case "MbzReleaseGroupWithInfo":
            case "MbzRelease":
            case "MbzReleaseGroup":
            case "MbzArtist":
                return null;
            default:
                throw exhausted(this.data)
        }
    }
}

interface IClassTypeWrapper {
    next_page(): Promise<MbzListItem[]>;
};
function ClassTypeWrapper<S extends Constructor<{
    next_page(): Promise<MusicListItem[]>;
}>>(s: S) {
    return class extends s implements IClassTypeWrapper {
        // @ts-ignore
        async next_page(): Promise<MbzListItem[]> {
            let res = await super.next_page();
            return res.map(m => new MbzListItem(m));
        }
    } as Constructor<IClassTypeWrapper> & S;
}

interface IUnionTypeWrapper {
    next_page(): Promise<MusicListItem[]>;
};
function UnionTypeWrapper<T extends Keyed, S extends Constructor<{
    query: BrowseQuery;
    next_page(): Promise<T[]>;
}>>(s: S) {
    return class extends s implements IUnionTypeWrapper {
        // @ts-ignore
        async next_page(): Promise<MusicListItem[]> {
            let res = await super.next_page();

            let type = this.query.query_type;
            switch (type) {
                case "search": {
                    let typ = this.query.type;
                    return res.map(data => ({
                        typ: typ,
                        data: data,
                        get_key: data.get_key,
                    })) as unknown as MusicListItem[];
                } break;
                case "linked": {
                    let typ = this.query.type;
                    return res.map(data => ({
                        typ: typ.substring(0, typ.indexOf("_")),
                        data: data,
                        get_key: data.get_key,
                    })) as unknown as MusicListItem[]
                } break;
                default:
                    throw exhausted(type)
            }
        }
    } as Constructor<IUnionTypeWrapper> & S;
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
            if (!set.has(rec.data.data.get_key())) {
                set.add(rec.data.data.get_key());
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
            case "MbzRadioSong":
                return server_base + "mbz/radio";
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

    static new<W extends SearcherConstructorMapper>(query: BrowseQuery, page_size: number, wrapper: W | null = null, drop_handle: ListItem | null = null) {
        const UW = UnionTypeWrapper(Mbz);
        const CW = ClassTypeWrapper(UW);
        const US = UniqueSearch<MbzListItem, typeof Mbz<MbzListItem>>(CW);
        const SS = SavedSearch<MbzListItem, typeof US>(US);
        const AW = DebounceWrapper<MbzListItem, typeof SS>(SS);
        const DW = DropWrapper<typeof AW>(AW, drop_handle);
        const W = DW;
        if (wrapper) {
            const WR = wrapper(W) as typeof W;
            return new WR(query, page_size);
        } else {
            return new W(query, page_size);
        }
    }

    static unwrapped<T>(query: BrowseQuery, page_size: number) {
        const US = UniqueSearch<T & Keyed, typeof Mbz<T>>(Mbz);
        const SS = SavedSearch<T, typeof US>(US);
        const AW = DebounceWrapper<T, typeof SS>(SS);
        return new AW(query, page_size);
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

    options(): Option[] {
        return [];
    }

    cont: MBZ.SearchContinuation | null = null;
    route: string = '';
    page_end_index: number = 0;
    async next_page(): Promise<(T & Keyed)[]> {
        if (!this.has_next_page) {
            return [];
        }

        if (this.query.query_type === 'search') {
            if (this.query.type == "MbzRadioSong") {
                this.has_next_page = false;
                this.route = mbz.search_route(this.query.type);
                let songs: RadioSong[] = await server.api_request(this.route, this.query.query);
                let k: (RadioSong & Keyed)[] = songs.map(s => {
                    let p = s as unknown as RadioSong & Keyed;
                    p.get_key = () => {
                        return p.identifier.at(0) ?? (p.title + p.creator + p.album);
                    };
                    return p;
                });
                return k as unknown as (T & Keyed)[];
            } else {
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
            }
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
