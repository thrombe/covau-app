import type { AlmostDbItem } from "$lib/local/db.ts";

export abstract class ListItem {
    abstract key(): unknown;
    abstract title(): string;
    abstract thumbnail(): string | null;
    abstract default_thumbnail(): string;
    abstract title_sub(): string | null;
    abstract options(ctx: RenderContext): Option[];
    abstract audio_uri(): Promise<string | null>;
    abstract savable(): AlmostDbItem<unknown> | null;
}

export class CustomListItem extends ListItem {
    _key: string;
    _title: string;
    _title_sub: string | null = null;
    _thumbnail: string | null = null;
    _default_thumbnail: string = "/static/default-music-icon.svg"
    _options: Option[] = [];

    constructor(key: string, title: string) {
        super();
        this._key = key;
        this._title = title;
    }

    key() {
        return this._key;
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

    options(_ctx: RenderContext) {
        return this._options;
    }

    savable() {
        return null;
    }
}

export type RenderContext = "Queue" | "Browser" | "Playbar";
export type Callback = (() => void) | (() => Promise<void>);
export type Option = {
    icon: string,
    tooltip: string,
    location: "IconTop" | "TopRight" | "BottomRight" | "OnlyMenu",
    onclick: Callback,
};
