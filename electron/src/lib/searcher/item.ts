import type { DbOps } from "$lib/local/db.ts";
import type { AutoplayQueryInfo, AutoplayTyp } from "$lib/local/queue.ts";
import { exhausted, type Keyed } from "$lib/virtual";
import * as covau from "$types/covau.ts";
import type { DbItem } from "$types/db";
import * as icons from "$lib/icons.ts";
import type { Searcher } from "./searcher";
import type { Writable } from "svelte/store";

export type RenderContext = "Queue" | "Browser" | "Playbar" | "DetailSection";
export type Callback = (() => void) | (() => Promise<void>);
export type Option = {
    icon: string,
    title: string,
    location: "IconTop" | "TopRight" | "BottomRight" | "OnlyMenu",
    onclick: Callback,
};

export abstract class ListItem implements Keyed {
    custom_options: ((ctx: RenderContext, old: Option[]) => Option[])[] = [];

    options(ctx: RenderContext) {
        let ops = this.impl_options(ctx);
        for (let fn of this.custom_options) {
            ops = fn(ctx, ops);
        }
        return ops;
    }

    abstract get_key(): unknown; // literally anything unique
    abstract song_ids(): string[]; // a id that might identify this song
    abstract title(): string;
    abstract thumbnail(): string | null;
    abstract default_thumbnail(): string;
    abstract title_sub(): string | null;
    abstract impl_options(ctx: RenderContext): Option[];
    abstract audio_uri(): Promise<string | null>;
    abstract saved_covau_song(db: DbOps): Promise<DbItem<covau.Song> | null>;
    abstract autoplay_query(typ: AutoplayTyp): Promise<AutoplayQueryInfo | null>;
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

    constructor(key: string, title: string) {
        super();
        this._key = key;
        this._title = title;
    }

    get_key() {
        return this._key;
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

export type DetailOption = Omit<Option, "location">;
export type InfoPiece = {
    heading: string,
    content: string | null,
};
export type DetailSection = ({
    type: "SongInfo",
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

export abstract class DetailItem {
    abstract title(): string;
    abstract thumbnail(): string | null;
    abstract default_thumbnail(): string;
    abstract sections(): DetailSection[];
}
