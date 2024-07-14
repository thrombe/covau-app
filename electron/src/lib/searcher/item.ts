import type { DbOps } from "$lib/local/db.ts";
import type { AutoplayQueryInfo, AutoplayTyp } from "$lib/local/queue.ts";
import { exhausted, type Keyed } from "$lib/virtual";
import * as covau from "$types/covau.ts";
import type { DbItem } from "$types/db";
import * as icons from "$lib/icons.ts";
import type { Searcher } from "./searcher";
import type { Writable } from "svelte/store";
import * as types from "$types/types.ts";
import type { MusicListItem as MbzItem } from "$lib/searcher/mbz.ts";

export type RenderContext = "Queue" | "Browser" | "Playbar" | "DetailSection" | "Prompt";
export type Callback = (() => void) | (() => Promise<void>);
export type Option = {
    icon: string,
    title: string,
    location: "IconTop" | "TopRight" | "BottomRight" | "OnlyMenu",
    onclick: Callback,
};

export type DetailOption = Omit<Option, "location">;
export type InfoPiece = {
    heading: string,
    content: string | null,
};
export type DetailSection = ({
    type: "Info",
    info: InfoPiece[],
} | {
    type: "Searcher",
    title: string,
    searcher: Writable<Searcher>,
    options: DetailOption[],
    height: number,
} | {
    type: "Options",
    title: string,
    options: DetailOption[],
} | {
    type: "Rearrange",
    title: string,
    items: ListItem[],
} | {
    type: "PrettyJson",
    title: string,
    content: string,
});
export type Typ = types.db.Typ | MbzItem["typ"] | types.yt.Typ | "Nothing";


export abstract class ListItem implements Keyed {
    custom_options: ((ctx: RenderContext, old: Option[]) => Option[])[] = [];

    options(ctx: RenderContext) {
        let ops = this.impl_options(ctx);
        for (let fn of this.custom_options) {
            ops = fn(ctx, ops);
        }
        return ops;
    }
    common_options() {
        let stores_ts = import("$lib/stores.ts");
        let common_options = {
            queue_play: {
                icon: icons.play,
                location: "IconTop",
                title: "play",
                onclick: async () => {
                    let stores = await stores_ts;
                    await stores.queue_ops.play_item(this);
                },
            },
            queue_remove_while_in_queue: {
                icon: icons.remove,
                location: "TopRight",
                title: "remove item",
                onclick: async () => {
                    let stores = await stores_ts;
                    await stores.queue_ops.remove_item(this);
                },
            },
            // queue_remove: {
            //     icon: icons.remove,
            //     location: "OnlyMenu",
            //     title: "remove from queue",
            //     onclick: async () => {
            //         let stores = await stores_ts;
            //         await stores.queue_ops.remove_item(this);
            //     },
            // },
            detour: {
                icon: icons.play,
                location: "IconTop",
                title: "play",
                onclick: async () => {
                    let stores = await stores_ts;
                    await stores.queue_ops.detour(this);
                },
            },
            queue_add: {
                icon: icons.add,
                location: "TopRight",
                title: "add to queue",
                onclick: async () => {
                    let stores = await stores_ts;
                    await stores.queue_ops.add_item(this);
                },
            },
            open_details: {
                icon: icons.open_new_tab,
                location: "OnlyMenu",
                title: "details",
                onclick: async () => {
                    let stores = await stores_ts;
                    let title = `${this.title()} details`
                    stores.new_detail_tab(this, title);
                },
            },
        };
        return common_options;
    }
    common_sections(json_data: Object) {
        let sections = {
            options: {
                type: "Options",
                title: "Options",
                options: this.options("DetailSection"),
            },
            json: {
                type: "PrettyJson",
                title: "Internal data",
                content: JSON.stringify(json_data, null, 2),
            },
            ops: {
                maybe<T, P>(t: T | null, fn: (t: T) => P) {
                    let non_null = [t].filter(n => n != null) as T[];
                    return non_null.map(n => fn(n));
                },
            },
        };
        return sections;
    }
    is_playable(): boolean {
        let typ = this.typ();
        switch (typ) {
            case "MmSong":
            case "Song":
            case "StSong":
            case "YtSong":
            case "StVideo":
            case "MbzRadioSong":
            case "MbzRecordingWithInfo":
            case "MbzRecording":
                return true;
            case "MbzRelease":
            case "MbzReleaseGroup":
            case "Queue":
            case "MmAlbum":
            case "MmArtist":
            case "MmPlaylist":
            case "MmQueue":
            case "Playlist":
            case "Updater":
            case "StAlbum":
            case "StPlaylist":
            case "StArtist":
            case "MbzReleaseWithInfo":
            case "MbzReleaseGroupWithInfo":
            case "MbzArtist":
            case "YtAlbum":
            case "YtPlaylist":
            case "YtArtist":
            case "Nothing":
                return false;
            default:
                throw exhausted(typ);
        }
    }

    // song methods
    abstract song_ids(): string[]; // a id that might identify this song
    abstract yt_id(): Promise<string | null>; // get yt id for playing purposes
    abstract audio_uri(): Promise<string | null>;
    abstract saved_covau_song(db: DbOps): Promise<DbItem<covau.Song> | null>;
    abstract autoplay_query(typ: AutoplayTyp): Promise<AutoplayQueryInfo | null>;

    // container methods
    abstract handle_drop(item: ListItem, target: number | null, is_outsider: boolean): Promise<boolean>;

    // common methods
    abstract get_key(): unknown; // literally anything unique
    abstract typ(): Typ;
    abstract title(): string;
    abstract thumbnail(): string | null;
    abstract default_thumbnail(): string;
    abstract title_sub(): string | null;
    abstract impl_options(ctx: RenderContext): Option[];
    abstract sections(): DetailSection[];
}

export class CustomListItem extends ListItem {
    _key: string;
    _ids: string[] = [];
    _title: string;
    _title_sub: string | null = null;
    _artists: string[] = [];
    _thumbnail: string | null = null;
    _default_thumbnail: string = icons.default_music_icon
    _options: Option[] = [];
    _sections: DetailSection[] = [];
    _typ: Typ;
    _yt_id: string | null = null;

    constructor(key: string, title: string, typ: Typ, title_sub: string | null = null) {
        super();
        this._key = key;
        this._title = title;
        this._typ = typ;
        this._title_sub = title_sub;
    }

    async yt_id(): Promise<string | null> {
        return this._yt_id;
    }

    async handle_drop(item: ListItem, target: number | null, is_outsider: boolean): Promise<boolean> {
        return false;
    }

    get_key() {
        return this._key;
    }

    typ(): Typ {
        return this._typ;
    }

    song_ids() {
        return this._ids;
    }

    title() {
        return this._title;
    }

    title_sub() {
        return this._title_sub;
    }

    thumbnail() {
        return this._thumbnail;
    }

    default_thumbnail() {
        return this._default_thumbnail;
    }

    async audio_uri() {
        return null;
    }

    impl_options(_ctx: RenderContext) {
        return this._options;
    }

    async saved_covau_song() {
        return null;
    }

    sections(): DetailSection[] {
        return this._sections;
    }

    async autoplay_query(typ: AutoplayTyp): Promise<AutoplayQueryInfo | null> {
        let artists = this._artists.length > 0 ? this._artists : (this._title_sub !== null ? [this._title_sub] : []);
        switch (typ) {
            case "MbzRadio":
            case "StSearchRelated":
                return {
                    type: typ,
                    title: this._title,
                    artists,
                };
            case "StRelated":
                return null;
            default:
                throw exhausted(typ);
        }
    }
}
