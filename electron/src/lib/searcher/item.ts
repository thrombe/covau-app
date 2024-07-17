import type { DbOps } from "$lib/local/db.ts";
import type { AutoplayQueryInfo, AutoplayTyp } from "$lib/local/queue.ts";
import { exhausted, type Keyed } from "$lib/utils.ts";
import * as covau from "$types/covau.ts";
import type { DbItem } from "$types/db";
import * as icons from "$lib/icons.ts";
import type { Searcher } from "./searcher";
import { get, type Writable } from "svelte/store";
import * as types from "$types/types.ts";
import type { MusicListItem as MbzItem } from "$lib/searcher/mbz.ts";
import { toast } from "$lib/toast/toast";

export type RenderContext = "Queue" | "Browser" | "Playbar" | "DetailSection" | "Prompt";

export type OptionsDescription = {
    icon_top: Option | null,
    top_right: Option | null,
    bottom: Option[],
    menu: Option[],
};

export type Callback = (() => void) | (() => Promise<void>);
export type Option = {
    icon: string,
    title: string,
    onclick: Callback,
};

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
    options: Option[],
    height: number,
} | {
    type: "Options",
    title: string,
    options: Option[],
} | {
    type: "Rearrange",
    title: string,
    items: ListItem[],
} | {
    type: "PrettyJson",
    title: string,
    content: string,
});
export type Typ = types.db.Typ | MbzItem["typ"] | types.yt.Typ | "Custom" | "Nothing";


export abstract class ListItem implements Keyed {
    custom_options: ((ctx: RenderContext, old: OptionsDescription) => OptionsDescription)[] = [];

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
                title: "play",
                onclick: async () => {
                    let stores = await stores_ts;
                    await stores.queue_ops.play_item(this);
                },
            },
            set_as_seed: {
                icon: icons.repeat,
                title: "set as autoplay seed",
                onclick: async () => {
                    let stores = await stores_ts;
                    let queues = await import("$lib/local/queue.ts");
                    let q = get(stores.queue);
                    if (q instanceof queues.AutoplayQueueManager) {
                        await q.init_with_seed(this);
                    } else {
                        toast("autoplay is disabled", "error");
                    }
                },
            },
            queue_remove_while_in_queue: {
                icon: icons.remove,
                title: "remove item",
                onclick: async () => {
                    let stores = await stores_ts;
                    await stores.queue_ops.remove_item(this);
                },
            },
            // queue_remove: {
            //     icon: icons.remove,
            //     title: "remove from queue",
            //     onclick: async () => {
            //         let stores = await stores_ts;
            //         await stores.queue_ops.remove_item(this);
            //     },
            // },
            detour: {
                icon: icons.play,
                title: "play",
                onclick: async () => {
                    let stores = await stores_ts;
                    await stores.queue_ops.detour(this);
                },
            },
            queue_add: {
                icon: icons.add,
                title: "add to queue",
                onclick: async () => {
                    let stores = await stores_ts;
                    await stores.queue_ops.add_item(this);
                },
            },
            open_details: {
                icon: icons.open_new_tab,
                title: "details",
                onclick: async () => {
                    let stores = await stores_ts;
                    let title = `${this.title()} details`
                    stores.new_detail_tab(this, title);
                },
            },
            refresh_details: {
                icon: icons.repeat,
                title: "refresh details",
                onclick: async () => {
                    let stores = await stores_ts;
                    let title = `${this.title()} details`
                    stores.pop_tab();
                    stores.new_detail_tab(this, title);
                },
            },
            open_album: (a: types.yt.SmolAlbum | null) => {
                if (!a) {
                    return [];
                }
                let op = {
                    icon: icons.open_new_tab,
                    title: "open album",
                    onclick: async () => {
                        let st = await import("$lib/searcher/song_tube.ts");
                        let stores = await stores_ts;
                        let s = st.SongTube.new({
                            type: "Album",
                            content: a.id,
                        });
                        stores.new_tab(s, "Album " + a.name, this.thumbnail());
                    },
                };
                return [op];
            },
            empty_ops: {
                icon_top: null,
                top_right: null,
                bottom: [] as Option[],
                menu: [] as Option[],
            } as OptionsDescription,
        };
        return common_options;
    }
    common_sections(json_data: Object) {
        let sections = {
            options: {
                type: "Options",
                title: "Options",
                options: this.options("DetailSection").menu,
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
            case "Custom":
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

    // dbitem methods
    abstract like(): Promise<boolean>; 
    abstract dislike(): Promise<boolean>; 

    // container methods
    abstract handle_drop(item: ListItem, target: number | null, is_outsider: boolean): Promise<boolean>;

    // common methods
    abstract get_key(): unknown; // literally anything unique
    abstract typ(): Typ;
    abstract title(): string;
    abstract thumbnail(): string | null;
    abstract default_thumbnail(): string;
    abstract title_sub(): string | null;
    abstract impl_options(ctx: RenderContext): OptionsDescription;
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

    async handle_drop(): Promise<boolean> {
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

    async like(): Promise<boolean> {
        return false;
    }

    async dislike(): Promise<boolean> {
        return false;
    }

    async audio_uri() {
        return null;
    }

    impl_options(_ctx: RenderContext) {
        return this.common_options().empty_ops;
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
